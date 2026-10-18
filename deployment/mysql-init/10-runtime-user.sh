#!/bin/bash
(
set -eu
# Senha base64url (32 a 128 caracteres); sem interpolação SQL arbitrária.
case "${MYSQL_RUNTIME_PASSWORD:-}" in
  ''|*[!A-Za-z0-9_-]*) echo "Senha de execução inválida; inicialização recusada." >&2; exit 1 ;;
esac
if [ "${#MYSQL_RUNTIME_PASSWORD}" -lt 32 ] || [ "${#MYSQL_RUNTIME_PASSWORD}" -gt 128 ]; then
  echo "Senha de execução inválida; inicialização recusada." >&2
  exit 1
fi
if ! MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket --user=root >/dev/null 2>&1 <<SQL
CREATE USER 'mindos'@'%' IDENTIFIED BY '${MYSQL_RUNTIME_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON mindos.* TO 'mindos'@'%';
SQL
then
  echo "Não foi possível provisionar o usuário restrito; detalhes sensíveis omitidos." >&2
  exit 1
fi
)
