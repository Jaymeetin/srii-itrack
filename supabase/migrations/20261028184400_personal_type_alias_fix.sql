CREATE OR REPLACE FUNCTION public.i_track_edit_personal(p_document uuid, p_subject text, p_document_type text, p_notes text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); d public.documents%rowtype; name text:=btrim(coalesce(p_subject,'')); doc_type text:=btrim(coalesce(p_document_type,''));
begin
 if u is null or not coalesce((select private.i_track_is_operator()),false) then raise exception 'Approved account required';end if;
 select * into d from public.documents where id=p_document for update;
 if not found or d.created_by<>u or d.destination<>'personal' or d.completion_kind<>'personal_record' or d.status<>'completed'
 then raise exception 'Only the creator may edit an unforwarded personal record';end if;
 if length(name) not between 1 and 240 then raise exception 'Enter a title of up to 240 characters';end if;
 if not exists(select 1 from public.document_types where document_types.name=doc_type and is_active)
 then raise exception 'Choose an approved document type';end if;
 if doc_type<>d.document_type and exists(select 1 from public.document_attachments where document_id=d.id)
 then raise exception 'Document type cannot be changed after files are uploaded, because Drive attachments retain their original storage folder';end if;
 update public.documents set subject=name,document_type=doc_type,notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
 where id=p_document;
 insert into public.document_events(document_id,actor_user_id,event_type,note)
 values(d.id,u,'personal_record_edited','Personal record metadata updated; previous title: '||d.subject||'; previous type: '||d.document_type);
 return true;
end $function$
;