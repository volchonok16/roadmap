# Деплой на pallink.fun

| Сервис | Домен | Docker (localhost) |
|--------|--------|---------------------|
| Frontend | https://pallink.fun | `127.0.0.1:5173` |
| API | https://api.pallink.fun | `127.0.0.1:8000` |
| Postgres | только внутри Docker | `127.0.0.1:5432` |

## 1. DNS (ваши записи)

Все A-записи на **45.9.13.214**:

| Имя | FQDN | Для чего |
|-----|------|----------|
| `@` | pallink.fun | **Roadmap — frontend** (этот конфиг) |
| `www` | www.pallink.fun | редирект → pallink.fun |
| `api` | api.pallink.fun | **Roadmap — API** (этот конфиг) |
| `minio` | minio.pallink.fun | отдельный сервис — **свой** `sites-available/minio.conf` |
| `turn` | turn.pallink.fun | отдельный сервис (TURN) — **свой** конфиг nginx |

Конфиг `deploy/nginx/pallink.conf` обслуживает только **@ / www / api**.  
`minio` и `turn` не перенаправляются на Roadmap — иначе сломаются ваши другие сервисы на том же IP.

## 2. Docker на сервере

```bash
# Клон в пустую папку (рекомендуется)
git clone https://github.com/volchonok16/roadmap.git /var/www/roadmap
cd /var/www/roadmap

# Проверка: оба файла должны быть здесь
ls -la docker-compose.yml docker-compose.prod.yml

cp .env.production.example .env
# отредактируйте .env (TFS, пароль БД при необходимости)

docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
docker compose ps
curl -s http://127.0.0.1:8000/api/health
```

### Ошибка `no configuration file provided: not found`

1. Вы не в корне репозитория — выполните `pwd` и `ls docker-compose.yml`.
2. Репозиторий не склонирован — в каталоге нет `docker-compose.yml`, сделайте `git clone` (см. выше).
3. Клон попал во вложенную папку — тогда `cd /var/www/roadmap/roadmap` или переклонируйте в пустой каталог.
4. Всегда указывайте файлы явно:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Команда `docker compose up` **без `-f`** сработает только если вы стоите в каталоге, где лежит `docker-compose.yml` (или `compose.yaml`).

## 3. Nginx

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

sudo mkdir -p /var/www/certbot
sudo cp -r /opt/ganta/deploy/nginx/snippets /etc/nginx/snippets/
sudo cp /opt/ganta/deploy/nginx/pallink.certbot-bootstrap.conf /etc/nginx/sites-available/pallink.conf
sudo ln -sf /etc/nginx/sites-available/pallink.conf /etc/nginx/sites-enabled/pallink.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Проверьте по HTTP (до SSL): `http://pallink.fun`, `http://api.pallink.fun/api/health`.

## 4. Certbot (Let's Encrypt)

Один сертификат на все имена:

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d pallink.fun \
  -d www.pallink.fun \
  -d api.pallink.fun \
  --email you@example.com \
  --agree-tos \
  --no-eff-email
```

Либо интерактивно через nginx-плагин (после bootstrap-конфига):

```bash
sudo certbot --nginx -d pallink.fun -d www.pallink.fun -d api.pallink.fun
```

Подключите HTTPS-конфиг:

```bash
sudo cp /opt/ganta/deploy/nginx/pallink.conf /etc/nginx/sites-available/pallink.conf
sudo nginx -t && sudo systemctl reload nginx
```

Проверка:

```bash
curl -I https://pallink.fun
curl -s https://api.pallink.fun/api/health
```

Автопродление (cron уже ставит certbot):

```bash
sudo certbot renew --dry-run
```

## 5. Файрвол

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Порты `5173`, `8000`, `5432` снаружи не открывайте — только через nginx на 80/443.

## 6. Переменные приложения

В `.env` на сервере:

```env
APP_PUBLIC_URL=https://pallink.fun
API_PUBLIC_URL=https://api.pallink.fun
CORS_ALLOW_ORIGINS=https://pallink.fun,https://www.pallink.fun
VITE_API_URL=https://api.pallink.fun
```

После смены `VITE_API_URL` пересоберите frontend:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d frontend
```

## 7. Обновление

```bash
cd /opt/ganta && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
sudo nginx -t && sudo systemctl reload nginx
```

## Поддомены на этом сервере

| Имя | Конфиг nginx | Certbot (Roadmap) |
|-----|----------------|------------------|
| `pallink.fun` | `pallink.conf` | да |
| `www.pallink.fun` | `pallink.conf` (редирект) | да |
| `api.pallink.fun` | `pallink.conf` | да |
| `minio.pallink.fun` | отдельный файл, свой сертификат | нет (не в pallink.conf) |
| `turn.pallink.fun` | отдельный файл, свой сертификат | нет |

Сертификат Roadmap выпускайте **только** на три имени (не добавляйте minio/turn в одну команду с Roadmap, если у них другие `server` блоки):

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d pallink.fun -d www.pallink.fun -d api.pallink.fun
```

Для MinIO / TURN на том же VPS — отдельно, например:

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d minio.pallink.fun
sudo certbot certonly --webroot -w /var/www/certbot -d turn.pallink.fun
```
