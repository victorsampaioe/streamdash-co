UPDATE public.servers
SET server_group = name
WHERE server_group IS NULL OR server_group = '';