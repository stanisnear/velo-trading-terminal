-- Retry-safe user notifications: retain duplicate records for audit.
with repeated as (
 select id,row_number() over(partition by user_id,type,related_id order by created_at,id) as ordinal
 from public.notifications where not suppressed and related_id is not null
 and type in ('DEPOSIT','WITHDRAW','TRANSFER_SENT','POSITION_CLOSED','TAKE_PROFIT','STOP_LOSS','LIQUIDATION')
) update public.notifications n set suppressed=true from repeated r where n.id=r.id and r.ordinal>1;
create unique index if not exists notification_financial_event_once
on public.notifications(user_id,type,related_id)
where not suppressed and related_id is not null
and type in ('DEPOSIT','WITHDRAW','TRANSFER_SENT','POSITION_CLOSED','TAKE_PROFIT','STOP_LOSS','LIQUIDATION');
