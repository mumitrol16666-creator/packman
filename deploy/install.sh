#!/usr/bin/env bash
# Установка и обновление сайта Pacman на сервере с Docker и nginx.
#
#   первый запуск по IP:      bash install.sh 178.105.59.89
#   подключили домен:         bash install.sh pacman.kz www.pacman.kz
#   обновить код:             bash install.sh            (адрес берётся из прошлого запуска)
#
# Скрипт не трогает другие сайты: добавляет один файл в nginx и перезагружает его только после успешной проверки.
set -euo pipefail

REPO="https://github.com/mumitrol16666-creator/packman.git"
APP_DIR="/opt/pacman"
SITE_DIR="/var/www/pacman"
NGINX_NAME="pacman"

say() { printf '\n\033[1;33m› %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Запустите от root: sudo bash install.sh"
command -v docker >/dev/null || die "Docker не установлен. Поставьте его: https://docs.docker.com/engine/install/ubuntu/"
docker compose version >/dev/null 2>&1 || die "Нет плагина docker compose. Поставьте пакет docker-compose-plugin."
command -v nginx >/dev/null || die "nginx не найден"
command -v git >/dev/null || die "git не найден: apt install git"

say "Код: $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# адреса: из аргументов, иначе из прошлого запуска
if [ "$#" -gt 0 ]; then HOSTS="$*"; else HOSTS="$(grep -s '^PACMAN_HOSTS=' .env | cut -d= -f2- || true)"; fi
[ -n "${HOSTS:-}" ] || die "Укажите адрес: bash install.sh 178.105.59.89"
MAIN_HOST="${HOSTS%% *}"

# по IP сайт работает без HTTPS и закрыт от поисковиков; с доменом — HTTPS и индексация
if [[ "$MAIN_HOST" =~ ^[0-9.]+$ ]]; then SITE_URL="http://$MAIN_HOST"; NOINDEX="1"; else SITE_URL="https://$MAIN_HOST"; NOINDEX=""; fi

set_env() { # set_env KEY VALUE — меняет или добавляет строку в .env, остальное не трогает
  if grep -q "^$1=" .env 2>/dev/null; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}

NEW_PASSWORD=""
if [ ! -f .env ]; then
  say "Создаю .env"
  NEW_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  cat > .env <<ENV
ADMIN_PASSWORD=$NEW_PASSWORD
PUBLIC_TRACK_URL=/api/track
PUBLIC_METRIKA_ID=
TG_BOT_TOKEN=
TG_REPORT_CHAT_ID=
TG_BOOKINGS_CHAT_ID=
REPORT_HOUR=9
TIMEZONE=Asia/Aqtobe
ENV
  chmod 600 .env
fi
set_env PACMAN_HOSTS "$HOSTS"
set_env SITE_URL "$SITE_URL"
set_env PUBLIC_NOINDEX "$NOINDEX"
set_env HOST_SITE_DIR "$SITE_DIR"

say "Папка сайта: $SITE_DIR"
mkdir -p "$SITE_DIR"
chown -R 1000:1000 "$SITE_DIR"   # в контейнере сервис работает от пользователя node (uid 1000)

say "Сборка образа и запуск контейнера"
docker compose up -d --build

say "Жду первую сборку сайта"
for _ in $(seq 1 90); do [ -f "$SITE_DIR/index.html" ] && break; sleep 2; done
[ -f "$SITE_DIR/index.html" ] || { docker compose logs --tail 40; die "Сайт не собрался за 3 минуты, журнал выше"; }

say "nginx"
if [ -d /etc/nginx/sites-available ]; then CONF="/etc/nginx/sites-available/$NGINX_NAME"; LINK="/etc/nginx/sites-enabled/$NGINX_NAME"; else CONF="/etc/nginx/conf.d/$NGINX_NAME.conf"; LINK=""; fi
if [ -f "$CONF" ] && grep -q "managed by Certbot" "$CONF"; then
  echo "В $CONF уже есть настройки HTTPS от certbot: файл не перезаписываю."
else
  [ -f "$CONF" ] && cp "$CONF" "$CONF.bak.$(date +%s)"
  sed -e "s|__HOST__|$HOSTS|" -e "s|__SITE_DIR__|$SITE_DIR|" deploy/nginx-pacman.conf > "$CONF"
  [ -n "$LINK" ] && ln -sfn "$CONF" "$LINK"
  if ! nginx -t; then
    [ -n "$LINK" ] && rm -f "$LINK"
    die "nginx не принял конфигурацию: файл отключён, остальные сайты работают как раньше"
  fi
  systemctl reload nginx
fi

say "Готово"
echo "Сайт:     $SITE_URL/"
echo "Админка:  $SITE_URL/admin/"
if [ -n "$NEW_PASSWORD" ]; then
  echo "Пароль админки: $NEW_PASSWORD"
  echo "Он записан в $APP_DIR/.env (ADMIN_PASSWORD). Сменить: поправить файл и выполнить docker compose up -d"
fi
if [ -z "$NOINDEX" ]; then
  echo
  echo "Включить HTTPS для домена: certbot --nginx -d ${HOSTS// / -d }"
else
  echo
  echo "Сайт открыт по IP без HTTPS: пароль админки идёт по сети открытым текстом."
  echo "Для проверки этого достаточно. После подключения домена и HTTPS смените пароль."
fi
