SELECT current_database() AS database_name, current_user AS database_user;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles','rooms','room_players','games','messages','maps','skins',
    'inventario','personalizacao','transacoes','presentes','staff',
    'staff_permissions','banimentos','acoes_admin','configuracoes_jogo'
  )
ORDER BY table_name, ordinal_position;

SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles','rooms','room_players','games','messages','maps','skins',
    'inventario','personalizacao','transacoes','presentes','staff',
    'staff_permissions','banimentos','acoes_admin','configuracoes_jogo'
  )
ORDER BY tablename, indexname;
