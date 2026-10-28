begin;
do $test$
declare
 user_id uuid; admin_id uuid; school_id uuid; school_name text; type_name text;
 personal_no text; personal_doc uuid; no_return_no text; return_no text;
 no_return_id uuid; return_id uuid; division_item uuid; tr_id uuid;
 dbatch jsonb; district_id uuid; pair uuid[]; district_items uuid[];
 no_item uuid; yes_item uuid; division_no text; division_doc uuid; division_t uuid;
 statuses jsonb; denied boolean;
begin
 select p.id,p.school_id into user_id,school_id from public.profiles p
 join auth.users au on au.id=p.id where p.role='school_user' and p.account_status='active'
 and p.school_id is not null and au.email_confirmed_at is not null limit 1;
 select id into admin_id from public.profiles where role='main_admin' and account_status='active' limit 1;
 select name into school_name from public.schools where id=school_id;
 select name into type_name from public.document_types where is_active order by name limit 1;
 if user_id is null or school_id is null or admin_id is null or type_name is null then
  raise exception 'Test prerequisites missing';
 end if;
 perform set_config('request.jwt.claim.sub',user_id::text,true);
 personal_no:=public.i_track_create_document('TEST PERSONAL v48',type_name,null,'personal','first draft',false);
 select id into personal_doc from public.documents where tracking_number=personal_no;
 if not exists(select 1 from public.documents where id=personal_doc and status='completed'
  and completion_kind='personal_record' and destination='personal') then
  raise exception 'Personal record not automatically completed';end if;
 perform public.i_track_edit_personal(personal_doc,'TEST PERSONAL REVISED v48',type_name,'revised notes');
 if (select subject from public.documents where id=personal_doc)<>'TEST PERSONAL REVISED v48' then
  raise exception 'Personal edit failed';end if;
 perform public.i_track_forward_personal(personal_doc,'division',null,false);
 if not exists(select 1 from public.documents where id=personal_doc and status='in_school'
  and destination='division' and completion_kind is null and not return_required) then
  raise exception 'Personal forward did not reopen original document';end if;

 no_return_no:=public.i_track_create_document('TEST DISTRICT NO RETURN',type_name,null,'district',null,false);
 return_no:=public.i_track_create_document('TEST DISTRICT FOR RETURN',type_name,null,'district',null,true);
 select id into no_return_id from public.documents where tracking_number=no_return_no;
 select id into return_id from public.documents where tracking_number=return_no;
 dbatch:=public.i_track_district_action('create',p_school=>school_id,
  p_address=>school_name||', San Remigio, Antique',p_document_ids=>array[no_return_id,return_id]);
 district_id:=(dbatch->>'id')::uuid;
 if not exists(select 1 from public.district_transmittals where id=district_id
  and school_address like school_name||'%') then raise exception 'School address missing from transmittal';end if;
 select array_agg(id) into district_items from public.district_transmittal_items where transmittal_id=district_id;
 perform public.i_track_district_action('submit',p_transmittal=>district_id,p_item_ids=>district_items,
  p_actual_date=>(now() at time zone 'Asia/Manila')::date);
 if not exists(select 1 from public.documents where id=no_return_id and status='completed'
 and completion_kind='filed_district') then raise exception 'District No Return did not complete';end if;
 if not exists(select 1 from public.documents where id=return_id and status<>'completed') then
  raise exception 'For Return prematurely completed';end if;
 select id into yes_item from public.district_transmittal_items where document_id=return_id;
 perform public.i_track_district_action('ready',p_item=>yes_item);
 perform public.i_track_district_action('claim',p_item=>yes_item);
 if not exists(select 1 from public.documents where id=return_id and status='completed'
 and completion_kind='returned_owner') then raise exception 'Rightful owner did not complete';end if;

 insert into public.division_transmittals(transmittal_number,prepared_by,assigned_submitter,
 status,assignment_accepted_at,assignment_accepted_by)
 values('SRII-TEST-TRANS-v48-'||substr(gen_random_uuid()::text,1,8),user_id,user_id,
 'draft',now(),user_id) returning id into division_t;
 insert into public.division_transmittal_items(transmittal_id,document_id,document_label,
 tracking_number,school_id,document_type)
 values(division_t,personal_doc,'TEST PERSONAL REVISED v48',personal_no,school_id,type_name)
 returning id into division_item;
 perform public.i_track_division_action(p_action=>'submit',p_transmittal=>division_t,
  p_item=>division_item,p_actual_date=>(now() at time zone 'Asia/Manila')::date);
 if not exists(select 1 from public.division_transmittal_items where id=division_item
 and division_status='not_for_return') then raise exception 'Division No Return item did not close';end if;
 if not exists(select 1 from public.documents where id=personal_doc and status='completed'
 and completion_kind='filed_division') then raise exception 'Division No Return did not complete';end if;
 if exists(select 1 from jsonb_array_elements(public.i_track_retrieval_board()->'available') x
 where x->>'item_id'=division_item::text) then raise exception 'No Return item shown for retrieval';end if;

 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.i_track_document_type_manage('add','TEST ADMIN TYPE v48');
 if not exists(select 1 from public.document_types where name='TEST ADMIN TYPE v48' and is_active) then
 raise exception 'Admin addition failed';end if;
 perform public.i_track_document_type_manage('deactivate','TEST ADMIN TYPE v48');
 if exists(select 1 from public.document_types where name='TEST ADMIN TYPE v48' and is_active) then
 raise exception 'Admin deactivation failed';end if;
 perform public.i_track_document_type_manage('reactivate','TEST ADMIN TYPE v48');
 if not exists(select 1 from jsonb_array_elements(public.i_track_document_types_admin()->'types') x
 where x->>'name'='TEST ADMIN TYPE v48' and (x->>'active')::boolean) then
 raise exception 'Admin management screen did not read type';end if;
end $test$;
rollback;
select 'PASS: personal completion/edit/forward; district 2-document transmittal with own signatory/school address, No Return auto-completion, For Return owner confirmation; Division No Return auto-completion; admin type add/deactivate/reactivate' as result;