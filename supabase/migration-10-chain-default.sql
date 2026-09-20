-- كل البراندات: المنشور يمر بالمدير ثم العميل
alter table brands alter column client_approval set default true;
update brands set client_approval = true;
