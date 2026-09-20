-- Bucket privado pros anexos da caixa de execução do Time de Marketing
-- (laudo PDF/foto do Perito, foto do Vitrine etc.). Acesso só via service_role
-- (rotas server-side) ou signed URL — sem policy pública, sem policy de RLS
-- pra usuário autenticado (não é necessário: upload/leitura passam pelo servidor).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-squad-uploads',
  'marketing-squad-uploads',
  false,
  104857600, -- 100MB (cobre PDF de laudo, foto e vídeo curto)
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
