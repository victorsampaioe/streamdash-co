-- RLS on storage.objects for hub-docs bucket
CREATE POLICY "hub-docs: owner reads own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hub-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "hub-docs: owner uploads own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hub-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "hub-docs: owner deletes own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hub-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "hub-docs: admin manages"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'hub-docs' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'hub-docs' AND public.has_role(auth.uid(),'admin'));