"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = [
  "caixa-geral-depositos.html",
  "novobanco.html",
  "coverflex.html"
];
const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900, scale: 1, mobile: false },
  { name: "iphone-390x844", width: 390, height: 844, scale: 3, mobile: true },
  { name: "iphone-430x932", width: 430, height: 932, scale: 3, mobile: true },
  { name: "ipad-768x1024", width: 768, height: 1024, scale: 2, mobile: true },
  { name: "landscape-844x390", width: 844, height: 390, scale: 2, mobile: true }
];
const auditDirectory = process.env.STICKY_AUDIT_DIR
  ? path.resolve(process.env.STICKY_AUDIT_DIR)
  : "";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  const chromePath = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(chromePath, "Chrome was not found. Set CHROME_PATH to run the sticky navigation audit.");
  return chromePath;
}

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

async function startStaticServer() {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentType(filePath)
    });
    fs.createReadStream(filePath).pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function launchChrome() {
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-sticky-audit-"));
  const chrome = childProcess.spawn(findChrome(), [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-features=MediaRouter,OptimizationHints,Translate",
    "--disable-gpu",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "about:blank"
  ], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });

  const debuggerUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Chrome DevTools did not start.\n${stderr}`)), 15000);
    chrome.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    chrome.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools was ready (code ${code}).\n${stderr}`));
    });
    chrome.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return {
    chrome,
    profileDirectory,
    debuggerUrl,
    async close() {
      if (chrome.exitCode === null) {
        chrome.kill();
        await Promise.race([
          new Promise((resolve) => chrome.once("exit", resolve)),
          delay(3000)
        ]);
      }
      fs.rmSync(profileDirectory, { recursive: true, force: true });
    }
  };
}

function requestJson(port, requestPath, method = "GET") {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`DevTools HTTP ${response.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(new Error(`Invalid DevTools response: ${body}`));
        }
      });
    });
    request.once("error", reject);
    request.end();
  });
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8"));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.error) {
          pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        } else {
          pending.resolve(message.result || {});
        }
        return;
      }
      const listeners = this.listeners.get(message.method);
      if (listeners) {
        [...listeners].forEach((listener) => listener(message.params || {}));
      }
    });
  }

  static async connect(webSocketUrl) {
    assert.equal(typeof WebSocket, "function", "Node.js with built-in WebSocket support is required.");
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out connecting to Chrome DevTools.")), 10000);
      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Chrome DevTools WebSocket failed."));
      }, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, 15000);
      this.pending.set(id, { method, resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  once(method, timeoutMilliseconds = 15000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        remove();
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMilliseconds);
      const remove = this.on(method, (params) => {
        clearTimeout(timeout);
        remove();
        resolve(params);
      });
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(client, expression, label, timeoutMilliseconds = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    if (await evaluate(client, expression)) return;
    await delay(75);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

const snapshotExpression = `(() => {
  const card = document.querySelector(".temporal-nav-card");
  const topbar = document.querySelector(".topbar");
  const cardStyle = getComputedStyle(card);
  const topbarStyle = getComputedStyle(topbar);
  const rect = (element) => {
    const value = element.getBoundingClientRect();
    return {
      top: value.top,
      right: value.right,
      bottom: value.bottom,
      left: value.left,
      width: value.width,
      height: value.height
    };
  };
  const transformedAncestors = [];
  const scrollingAncestors = [];
  for (let ancestor = card.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.transform !== "none") transformedAncestors.push(ancestor.tagName + "." + ancestor.className);
    if (/auto|scroll|hidden/.test(style.overflowY)) scrollingAncestors.push(ancestor.tagName + "." + ancestor.className);
  }
  return {
    card: rect(card),
    topbar: rect(topbar),
    position: cardStyle.position,
    computedTop: parseFloat(cardStyle.top),
    cardZIndex: Number(cardStyle.zIndex),
    topbarZIndex: Number(topbarStyle.zIndex),
    scrollY,
    viewportHeight: innerHeight,
    documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    transformedAncestors,
    scrollingAncestors,
    menuOpen: topbar.classList.contains("menu-open")
  };
})()`;

async function inspectComposition(client) {
  return evaluate(client, `(() => {
    const main = document.querySelector("main.page-grid");
    const hero = document.querySelector(".hero");
    const nav = document.querySelector(".temporal-nav-card");
    const summary = document.querySelector("#cgd-temporal-summary-chart")?.closest("section");
    const flow = document.querySelector("#cgd-monthly-flow-chart")?.closest("section");
    const totalizer = document.querySelector("#cgd-totalizer")?.closest("section");
    const alerts = document.querySelector("#cgd-alerts-section");
    const children = [...main.children];
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height
      };
    };
    const activeMonth = nav.querySelector(".month-tile.active");
    const navRect = rect(nav);
    const activeMonthRect = rect(activeMonth);
    return {
      navCount: document.querySelectorAll(".temporal-nav-card").length,
      timelineCount: document.querySelectorAll("#month-timeline").length,
      navIndex: children.indexOf(nav),
      summaryIndex: children.indexOf(summary),
      flowIndex: children.indexOf(flow),
      totalizerIndex: children.indexOf(totalizer),
      alertsIndex: children.indexOf(alerts),
      hero: rect(hero),
      nav: navRect,
      summary: rect(summary),
      flow: rect(flow),
      activeMonth: activeMonth?.getAttribute("data-month") || null,
      activeMonthAriaCurrent: activeMonth?.getAttribute("aria-current") || null,
      activeMonthHorizontallyVisible: Boolean(
        activeMonthRect
        && activeMonthRect.left >= navRect.left - 1
        && activeMonthRect.right <= navRect.right + 1
      ),
      nestedHorizontalScrollers: [...nav.querySelectorAll("*")].filter((element) => {
        const style = getComputedStyle(element);
        return /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
      }).length
    };
  })()`);
}

function assertComposition(composition, page, viewport, { scriptsEnabled }) {
  const label = `${page} ${viewport.name}${scriptsEnabled ? "" : " no-JS"}`;
  const hasFlow = page !== "coverflex.html";
  assert.equal(composition.navCount, 1, `${label}: temporal navigation is duplicated`);
  assert.equal(composition.timelineCount, 1, `${label}: month timeline ID is duplicated`);
  assert.equal(composition.navIndex, 0, `${label}: temporal navigation is not the first financial section`);
  assert.equal(composition.summaryIndex, 1, `${label}: Saldo does not immediately follow temporal navigation`);
  assert.ok(composition.nav.top > composition.hero.bottom, `${label}: temporal navigation overlaps the hero`);
  assert.ok(composition.summary.top > composition.nav.bottom, `${label}: Saldo overlaps temporal navigation`);
  assert.ok(composition.nav.top - composition.hero.bottom <= 30, `${label}: hero/navigation gap is excessive`);
  assert.ok(composition.summary.top - composition.nav.bottom <= 30, `${label}: navigation/Saldo gap is excessive`);
  assert.equal(composition.nestedHorizontalScrollers, 0, `${label}: nested horizontal scrollers were introduced`);

  if (hasFlow) {
    assert.equal(composition.flowIndex, 2, `${label}: Fluxo mensal does not immediately follow Saldo`);
    assert.ok(composition.flow.top > composition.summary.bottom, `${label}: temporal charts overlap`);
    assert.ok(composition.totalizerIndex > composition.flowIndex, `${label}: totalizer precedes Fluxo mensal`);
  } else {
    assert.equal(composition.flowIndex, -1, `${label}: Coverflex unexpectedly contains Fluxo mensal`);
    assert.equal(composition.totalizerIndex, 2, `${label}: Coverflex totalizer does not follow Saldo`);
  }

  if (page === "caixa-geral-depositos.html") {
    assert.ok(composition.alertsIndex > composition.flowIndex, `${label}: alerts remain before the temporal charts`);
  }

  if (scriptsEnabled) {
    assert.equal(composition.activeMonthAriaCurrent, "date", `${label}: active month lacks aria-current`);
    assert.equal(composition.activeMonthHorizontallyVisible, true, `${label}: active month is outside the viewport`);
  }
}

async function prepareTarget(debugPort, baseUrl, page, viewport, scriptEnabled) {
  const target = await requestJson(debugPort, `/json/new?${encodeURIComponent("about:blank")}`, "PUT");
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  const externalResponses = [];
  const externalRequests = [];
  client.on("Network.requestWillBeSent", ({ request }) => {
    if (request?.url?.startsWith("https://")) externalRequests.push(request.url);
  });
  client.on("Network.responseReceived", ({ response }) => {
    if (response?.url?.startsWith("https://")) externalResponses.push(response.url);
  });

  await client.send("Page.enable");
  await client.send("Page.bringToFront");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Network.setBlockedURLs", { urls: ["https://*"] });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.scale,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    screenOrientation: {
      type: viewport.width > viewport.height ? "landscapePrimary" : "portraitPrimary",
      angle: viewport.width > viewport.height ? 90 : 0
    }
  });
  await client.send("Emulation.setTouchEmulationEnabled", {
    enabled: viewport.mobile,
    ...(viewport.mobile ? { maxTouchPoints: 5 } : {})
  });

  if (scriptEnabled) {
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("dashboard_session", JSON.stringify({
        email: "sticky-audit@example.test",
        permissions: { consultar: true, editar: true },
        ts: Date.now()
      }));`
    });
  } else {
    await client.send("Emulation.setScriptExecutionDisabled", { value: true });
  }

  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url: `${baseUrl}/${page}` });
  await loaded;
  if (!scriptEnabled) {
    await client.send("Emulation.setScriptExecutionDisabled", { value: false });
  }

  assert.deepEqual(externalResponses, [], `${page} ${viewport.name}: an external response bypassed blocking`);
  return { target, client, externalRequests };
}

async function addAuditSpacer(client) {
  await evaluate(client, `(() => {
    document.documentElement.style.scrollBehavior = "auto";
    const spacer = document.createElement("div");
    spacer.dataset.stickyAuditSpacer = "true";
    spacer.style.height = "1800px";
    spacer.style.gridColumn = "1 / -1";
    spacer.style.pointerEvents = "none";
    document.querySelector(".page-grid").appendChild(spacer);
  })()`);
}

async function scrollPastCard(client) {
  await evaluate(client, `(async () => {
    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  const initial = await evaluate(client, snapshotExpression);
  const scrollTargets = await evaluate(client, `(() => {
    const card = document.querySelector(".temporal-nav-card");
    const cardDocumentTop = card.getBoundingClientRect().top + scrollY;
    const stickyTop = parseFloat(getComputedStyle(card).top);
    return {
      first: Math.ceil(cardDocumentTop - stickyTop + 140),
      second: Math.ceil(cardDocumentTop - stickyTop + 500)
    };
  })()`);
  await evaluate(client, `(async () => {
    window.scrollTo(0, ${scrollTargets.first});
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  const after = await evaluate(client, snapshotExpression);
  await evaluate(client, `(async () => {
    window.scrollTo(0, ${scrollTargets.second});
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  const later = await evaluate(client, snapshotExpression);
  return { initial, after, later };
}

async function inspectControls(client) {
  return evaluate(client, `(() => {
    const card = document.querySelector(".temporal-nav-card");
    const controls = [...card.querySelectorAll("button")];
    const cardRect = card.getBoundingClientRect();
    const accessibility = controls.map((control) => {
      control.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = control.getBoundingClientRect();
      return {
        label: control.getAttribute("aria-label"),
        visible: rect.width > 0 && rect.height > 0,
        horizontallyReachable: rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1,
        width: rect.width,
        height: rect.height
      };
    });
    card.scrollLeft = 0;
    return {
      buttonCount: controls.length,
      monthCount: card.querySelectorAll(".month-tile").length,
      scrollWidth: card.scrollWidth,
      clientWidth: card.clientWidth,
      overflowX: getComputedStyle(card).overflowX,
      accessibility
    };
  })()`);
}

async function inspectTemporalControlInteraction(client) {
  const before = await evaluate(client, `(() => {
    const nav = document.querySelector(".temporal-nav-card");
    window.__stickyAuditTemporalNav = nav;
    const december = nav.querySelector(".month-tile[data-month='11']");
    december.focus({ preventScroll: true });
    return {
      scrollY,
      scrollLeft: nav.scrollLeft,
      focusedMonth: document.activeElement?.getAttribute("data-month"),
      year: document.querySelector("[data-year-label]")?.textContent.trim()
    };
  })()`);
  await evaluate(client, "document.activeElement.click()");
  await delay(80);
  const afterMonth = await evaluate(client, `(() => {
    const nav = document.querySelector(".temporal-nav-card");
    const current = nav.querySelector(".month-tile[aria-current='date']");
    return {
      scrollY,
      scrollLeft: nav.scrollLeft,
      activeMonth: current?.getAttribute("data-month") || null,
      ariaCurrentCount: nav.querySelectorAll(".month-tile[aria-current='date']").length,
      focusedMonth: document.activeElement?.getAttribute("data-month") || null
    };
  })()`);

  await evaluate(client, `document.querySelector("[data-year-next]").focus({ preventScroll: true })`);
  await evaluate(client, "document.activeElement.click()");
  const nextYear = String(Number(before.year) + 1);
  await waitFor(
    client,
    `document.querySelector("[data-year-label]")?.textContent.trim() === ${JSON.stringify(nextYear)}`,
    "next year"
  );
  const afterYear = await evaluate(client, `(() => ({
    year: document.querySelector("[data-year-label]")?.textContent.trim(),
    navSame: window.__stickyAuditTemporalNav === document.querySelector(".temporal-nav-card"),
    navCount: document.querySelectorAll(".temporal-nav-card").length,
    monthCount: document.querySelectorAll(".month-tile").length,
    focusedYearAction: document.activeElement?.hasAttribute("data-year-next") ? "next" : ""
  }))()`);
  await evaluate(client, `document.querySelector("[data-year-prev]").focus({ preventScroll: true })`);
  await evaluate(client, "document.activeElement.click()");
  await waitFor(
    client,
    `document.querySelector("[data-year-label]")?.textContent.trim() === ${JSON.stringify(before.year)}`,
    "restored year"
  );

  return {
    before,
    afterMonth,
    afterYear,
    restoredYear: await evaluate(
      client,
      `document.querySelector("[data-year-label]")?.textContent.trim()`
    )
  };
}

async function inspectTemporalChartScrollSync(client) {
  return evaluate(client, `(async () => {
    const wrappers = [...document.querySelectorAll("[data-cgd-temporal-scroll]")];
    const summary = document.querySelector("[data-cgd-temporal-chart='summary']");
    const flow = document.querySelector("[data-cgd-temporal-chart='flow']");
    const geometryAligned = !flow || (
      summary?.getAttribute("data-chart-width") === flow.getAttribute("data-chart-width")
      && summary?.getAttribute("data-plot-left") === flow.getAttribute("data-plot-left")
      && summary?.getAttribute("data-plot-right") === flow.getAttribute("data-plot-right")
      && summary?.getAttribute("data-month-x") === flow.getAttribute("data-month-x")
    );
    let targetScrollLeft = 0;
    if (wrappers.length > 1) {
      const maximum = Math.max(0, wrappers[0].scrollWidth - wrappers[0].clientWidth);
      targetScrollLeft = Math.min(120, maximum);
      wrappers[0].scrollLeft = targetScrollLeft;
      wrappers[0].dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    return {
      wrapperCount: wrappers.length,
      geometryAligned,
      targetScrollLeft,
      scrollLeftValues: wrappers.map((wrapper) => wrapper.scrollLeft)
    };
  })()`);
}

function assertStickyGeometry(result, page, viewport, prefix = "", maxGap = Number.POSITIVE_INFINITY) {
  const label = `${page} ${viewport.name}${prefix}`;
  assert.equal(result.position, "sticky", `${label}: temporal navigation is not sticky`);
  assert.ok(Number.isFinite(result.computedTop), `${label}: sticky top is not numeric`);
  assert.ok(Math.abs(result.card.top - result.computedTop) <= 1, `${label}: card did not reach its sticky offset`);
  assert.ok(result.card.top >= result.topbar.bottom + 6, `${label}: temporal navigation overlaps the topbar`);
  assert.ok(result.card.top - result.topbar.bottom <= maxGap, `${label}: topbar/navigation gap is excessive`);
  assert.ok(result.card.bottom <= result.viewportHeight + 1, `${label}: temporal navigation is outside the viewport`);
  assert.ok(result.topbarZIndex > result.cardZIndex, `${label}: topbar must stack above temporal navigation`);
  assert.equal(result.documentOverflow, false, `${label}: horizontal overflow escaped to the document`);
  assert.deepEqual(result.transformedAncestors, [], `${label}: a transformed ancestor can invalidate sticky positioning`);
  assert.deepEqual(result.scrollingAncestors, [], `${label}: an overflow ancestor can invalidate sticky positioning`);
}

async function waitForMobileMenuStickyGeometry(client, expectedOpen) {
  await waitFor(
    client,
    `(() => {
      const topbar = document.querySelector(".topbar");
      const card = document.querySelector(".temporal-nav-card");
      if (!topbar || !card || topbar.classList.contains("menu-open") !== ${expectedOpen}) {
        return false;
      }
      const topbarRect = topbar.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const computedTop = Number.parseFloat(getComputedStyle(card).top);
      const gap = cardRect.top - topbarRect.bottom;
      return Math.abs(cardRect.top - computedTop) <= 1 && gap >= 6 && gap <= 10;
    })()`,
    `mobile menu ${expectedOpen ? "open" : "closed"} sticky offset`
  );
}

async function inspectModalLayer(client) {
  return evaluate(client, `(() => {
    const modal = document.querySelector("#confirm-modal");
    const hiddenVisibility = getComputedStyle(modal).visibility;
    modal.classList.add("show");
    modal.removeAttribute("inert");
    const shown = {
      visibility: getComputedStyle(modal).visibility,
      zIndex: Number(getComputedStyle(modal).zIndex)
    };
    modal.classList.remove("show");
    modal.setAttribute("inert", "");
    return {
      hiddenVisibility,
      shown,
      cardZIndex: Number(getComputedStyle(document.querySelector(".temporal-nav-card")).zIndex),
      topbarZIndex: Number(getComputedStyle(document.querySelector(".topbar")).zIndex)
    };
  })()`);
}

async function inspectTooltipLayer(client) {
  return evaluate(client, `(() => {
    const tooltip = document.querySelector("#cgd-temporal-summary-chart .outcome-evolution-tooltip");
    const card = tooltip?.closest(".card");
    const point = document.querySelector("#cgd-temporal-summary-chart .outcome-evolution-point");
    point.dispatchEvent(new FocusEvent("focus"));
    const result = {
      visible: tooltip.classList.contains("is-visible"),
      cardZIndex: Number(getComputedStyle(card).zIndex),
      navZIndex: Number(getComputedStyle(document.querySelector(".temporal-nav-card")).zIndex),
      topbarZIndex: Number(getComputedStyle(document.querySelector(".topbar")).zIndex)
    };
    point.dispatchEvent(new FocusEvent("blur"));
    return result;
  })()`);
}

async function inspectOpenMenuControls(client) {
  return evaluate(client, `(() => {
    const menu = document.querySelector(".topbar nav.menu");
    const controls = [...menu.querySelectorAll("a[href], button")];
    const menuRect = menu.getBoundingClientRect();
    const reachable = controls.map((control) => {
      control.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = control.getBoundingClientRect();
      return (
        rect.top >= menuRect.top - 1
        && rect.bottom <= menuRect.bottom + 1
        && rect.left >= menuRect.left - 1
        && rect.right <= menuRect.right + 1
      );
    });
    menu.scrollTop = 0;
    menu.scrollLeft = 0;
    return { count: controls.length, reachable };
  })()`);
}

async function captureScreenshot(client, fileName) {
  if (!auditDirectory) return;
  fs.mkdirSync(auditDirectory, { recursive: true });
  const { data } = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true
  });
  fs.writeFileSync(path.join(auditDirectory, fileName), Buffer.from(data, "base64"));
}

async function runEnabledCase(debugPort, baseUrl, page, viewport) {
  const { target, client, externalRequests } = await prepareTarget(debugPort, baseUrl, page, viewport, true);
  try {
    await waitFor(
      client,
      `document.readyState === "complete"
        && document.querySelectorAll(".month-tile").length === 12
        && document.querySelector(".menu-toggle")
        && document.querySelector(".temporal-nav-card")`,
      "dashboard rendering"
    );
    await delay(850);
    const composition = await inspectComposition(client);
    assertComposition(composition, page, viewport, { scriptsEnabled: true });
    await captureScreenshot(client, `${path.basename(page, ".html")}-${viewport.name}-top.png`);
    await addAuditSpacer(client);
    const { initial, after, later } = await scrollPastCard(client);
    const label = `${page} ${viewport.name}`;

    assert.equal(initial.position, "sticky", `${label}: base rule is not sticky`);
    assert.ok(later.scrollY - after.scrollY >= 300, `${label}: audit did not perform a second real scroll`);
    assert.ok(Math.abs(after.card.top - later.card.top) <= 2, `${label}: sticky position changed while scrolling`);
    assertStickyGeometry(after, page, viewport, " after first scroll", 18);
    assertStickyGeometry(later, page, viewport, " after second scroll", 18);

    const controls = await inspectControls(client);
    assert.equal(controls.buttonCount, 14, `${label}: expected two year and twelve month buttons`);
    assert.equal(controls.monthCount, 12, `${label}: expected twelve month buttons`);
    assert.equal(controls.overflowX, "auto", `${label}: horizontal scrolling is not contained by the card`);
    assert.ok(controls.accessibility.every((control) => control.visible), `${label}: a temporal control is hidden`);
    assert.ok(controls.accessibility.every((control) => control.horizontallyReachable), `${label}: a temporal control cannot be reached horizontally`);
    if (viewport.mobile) {
      assert.ok(
        controls.accessibility.every((control) => control.width >= 44 && control.height >= 44),
        `${label}: a temporal touch target is smaller than 44px`
      );
    }
    if (viewport.width <= 768) {
      assert.ok(controls.scrollWidth > controls.clientWidth, `${label}: narrow layout should expose contained horizontal scrolling`);
    }

    const interaction = await inspectTemporalControlInteraction(client);
    assert.equal(interaction.before.focusedMonth, "11", `${label}: keyboard could not focus December`);
    assert.equal(interaction.afterMonth.activeMonth, "11", `${label}: activating December did not select it`);
    assert.equal(interaction.afterMonth.ariaCurrentCount, 1, `${label}: month aria-current is not unique`);
    assert.equal(interaction.afterMonth.focusedMonth, "11", `${label}: month focus was lost`);
    assert.equal(interaction.afterMonth.scrollY, interaction.before.scrollY, `${label}: month reveal moved page scroll`);
    assert.ok(interaction.afterMonth.scrollLeft >= interaction.before.scrollLeft, `${label}: December was not revealed`);
    assert.deepEqual(
      interaction.afterYear,
      {
        year: String(Number(interaction.before.year) + 1),
        navSame: true,
        navCount: 1,
        monthCount: 12,
        focusedYearAction: "next"
      },
      `${label}: year navigation recreated or displaced the temporal navigation`
    );
    assert.equal(interaction.restoredYear, interaction.before.year, `${label}: year navigation did not restore the initial year`);

    const chartScroll = await inspectTemporalChartScrollSync(client);
    if (page === "coverflex.html") {
      assert.equal(chartScroll.wrapperCount, 0, `${label}: Coverflex gained temporal chart sync wrappers`);
    } else {
      assert.equal(chartScroll.wrapperCount, 2, `${label}: Saldo/Fluxo sync wrappers are missing`);
      assert.equal(chartScroll.geometryAligned, true, `${label}: Saldo/Fluxo month geometry diverged`);
      if (chartScroll.targetScrollLeft > 0) {
        assert.ok(
          chartScroll.scrollLeftValues.every((value) => Math.abs(value - chartScroll.targetScrollLeft) <= 1),
          `${label}: Saldo/Fluxo horizontal scroll is not synchronized`
        );
      }
    }

    const modal = await inspectModalLayer(client);
    assert.equal(modal.hiddenVisibility, "hidden", `${label}: a closed modal is visible`);
    assert.equal(modal.shown.visibility, "visible", `${label}: modal cannot be shown`);
    assert.ok(modal.shown.zIndex > modal.topbarZIndex && modal.shown.zIndex > modal.cardZIndex, `${label}: modal is not topmost`);
    const tooltipLayer = await inspectTooltipLayer(client);
    assert.equal(tooltipLayer.visible, true, `${label}: summary tooltip listener was lost after year rerender`);
    assert.ok(
      tooltipLayer.topbarZIndex > tooltipLayer.cardZIndex
      && tooltipLayer.cardZIndex > tooltipLayer.navZIndex,
      `${label}: visible chart tooltip is not layered between topbar and temporal navigation`
    );

    let menuOpen = null;
    if (viewport.width <= 1024) {
      await evaluate(client, `document.querySelector(".menu-toggle").click()`);
      await waitForMobileMenuStickyGeometry(client, true);
      menuOpen = await evaluate(client, snapshotExpression);
      assert.equal(menuOpen.menuOpen, true, `${label}: mobile menu did not open`);
      assertStickyGeometry(menuOpen, page, viewport, " with menu open", 10);
      const menuControls = await inspectOpenMenuControls(client);
      assert.ok(menuControls.count >= 5, `${label}: mobile menu controls are missing`);
      assert.ok(menuControls.reachable.every(Boolean), `${label}: a mobile menu control cannot be reached inside its scroll area`);
      await evaluate(client, `document.querySelector(".menu-toggle").click()`);
      await waitForMobileMenuStickyGeometry(client, false);
      const menuClosed = await evaluate(client, snapshotExpression);
      assert.equal(menuClosed.menuOpen, false, `${label}: mobile menu did not close`);
      assertStickyGeometry(menuClosed, page, viewport, " after menu close", 10);
    }

    const screenshotName = `${path.basename(page, ".html")}-${viewport.name}.png`;
    await captureScreenshot(client, screenshotName);
    return {
      page,
      viewport: viewport.name,
      blockedExternalRequests: externalRequests.length,
      beforeTop: initial.card.top,
      stickyTop: later.card.top,
      topbarBottom: later.topbar.bottom,
      menuOpenTop: menuOpen?.card.top ?? null,
      horizontalScroll: controls.scrollWidth > controls.clientWidth
    };
  } finally {
    client.close();
    await requestJson(debugPort, `/json/close/${target.id}`).catch(() => {});
  }
}

async function runNoScriptCase(debugPort, baseUrl, page, viewport) {
  const { target, client } = await prepareTarget(debugPort, baseUrl, page, viewport, false);
  try {
    await waitFor(client, `document.readyState === "complete" && document.querySelector(".temporal-nav-card")`, "no-JS document");
    const staticState = await evaluate(client, `(() => {
      const topbar = document.querySelector(".topbar");
      const menu = topbar.querySelector("nav.menu");
      const links = [...menu.querySelectorAll("a.menu-link")];
      const menuRect = menu.getBoundingClientRect();
      const linksReachable = links.map((link) => {
        link.scrollIntoView({ block: "nearest", inline: "nearest" });
        const rect = link.getBoundingClientRect();
        return rect.left >= menuRect.left - 1 && rect.right <= menuRect.right + 1;
      });
      menu.scrollLeft = 0;
      return {
        enhanced: topbar.classList.contains("nav-enhanced"),
        hasToggle: Boolean(topbar.querySelector(".menu-toggle")),
        linkCount: links.length,
        linksVisible: links.every((link) => link.getClientRects().length > 0),
        linksReachable,
        modalVisibility: getComputedStyle(document.querySelector("#confirm-modal")).visibility
      };
    })()`);
    const label = `${page} ${viewport.name} no-JS`;
    const composition = await inspectComposition(client);
    assertComposition(composition, page, viewport, { scriptsEnabled: false });
    assert.equal(staticState.enhanced, false, `${label}: enhancement ran while scripts were disabled`);
    assert.equal(staticState.hasToggle, false, `${label}: generated menu toggle exists without JavaScript`);
    assert.equal(staticState.linkCount, 5, `${label}: static primary navigation changed`);
    assert.equal(staticState.linksVisible, true, `${label}: static primary navigation is hidden`);
    assert.ok(staticState.linksReachable.every(Boolean), `${label}: a no-JS menu link cannot be reached horizontally`);
    assert.equal(staticState.modalVisibility, "hidden", `${label}: closed modal is visible`);

    await addAuditSpacer(client);
    const { after, later } = await scrollPastCard(client);
    assert.ok(Math.abs(after.card.top - later.card.top) <= 2, `${label}: fallback sticky position changed while scrolling`);
    assertStickyGeometry(after, page, viewport, " no-JS after first scroll");
    assertStickyGeometry(later, page, viewport, " no-JS after second scroll");
  } finally {
    client.close();
    await requestJson(debugPort, `/json/close/${target.id}`).catch(() => {});
  }
}

async function main() {
  const server = await startStaticServer();
  const browser = await launchChrome();
  const debugPort = Number(new URL(browser.debuggerUrl).port);
  const results = [];
  try {
    for (const page of pages) {
      for (const viewport of viewports) {
        const result = await runEnabledCase(debugPort, server.baseUrl, page, viewport);
        results.push(result);
        await runNoScriptCase(debugPort, server.baseUrl, page, viewport);
        console.log(`PASS ${page} ${viewport.name}`);
      }
    }
    if (auditDirectory) {
      fs.writeFileSync(
        path.join(auditDirectory, "measurements.json"),
        `${JSON.stringify(results, null, 2)}\n`
      );
    }
    console.log(`Sticky temporal navigation audit passed (${results.length} responsive cases plus no-JS).`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
