alter table public.customer_acquisition drop constraint if exists customer_acquisition_source_check;
alter table public.customer_acquisition add constraint customer_acquisition_source_check
 check (source in ('meta_ads','other_campaign','referral','organic','direct','social_unverified','unattributed'));
alter table public.customer_acquisition alter column source set default 'unattributed';