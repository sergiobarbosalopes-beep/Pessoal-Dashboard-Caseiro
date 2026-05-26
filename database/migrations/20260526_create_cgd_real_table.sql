create table if not exists public.cgd_real (
  ano int4 not null,
  mes int4 not null,
  real numeric,
  constraint cgd_real_pkey primary key (ano, mes),
  constraint cgd_real_mes_check check (mes between 1 and 12)
);
