# 🎳 Bowling Torneos — App Web

Gestión de torneos de bowling con acceso online. Los jugadores ven resultados desde cualquier dispositivo, solo el admin puede modificar datos.

## Instalación local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar contraseña (opcional)
cp .env.example .env
# Editá .env y cambiá ADMIN_PASSWORD

# 3. Iniciar
npm start
# → http://localhost:3000
```

## Deploy en Render (gratis)

1. Subí el proyecto a GitHub
2. Entrá a [render.com](https://render.com) y creá cuenta
3. **New → Web Service** → conectá tu repo
4. Configurá:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variables:**
     - `ADMIN_PASSWORD` = tu contraseña
5. Agregá un **Disk** en la sección de Storage:
   - **Mount Path:** `/opt/render/project/src/data`
   - **Size:** 1 GB (gratis)
6. Deploy!

## Deploy en Railway (gratis)

1. Subí a GitHub
2. Entrá a [railway.app](https://railway.app)
3. **New Project → Deploy from GitHub**
4. Agregá variable `ADMIN_PASSWORD`
5. Agregá un **Volume** montado en `/app/data`
6. Deploy!

## Uso

- **Ver datos**: cualquiera que entre a la URL ve jugadores, torneos y tablas
- **Editar**: tocá el 🔒 e ingresá la contraseña de admin
- **Contraseña default**: `bowling2025` (cambiala en las variables de entorno)

## Estructura

```
bowling-app/
├── server.js           # Servidor Express
├── package.json        # Dependencias
├── .env.example        # Variables de entorno
├── data/               # Base de datos SQLite (auto-creada)
│   └── bowling.db
└── public/
    └── index.html      # La app completa
```

## API

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/data` | No | Leer todos los datos |
| POST | `/api/data` | Sí | Guardar datos |
| POST | `/api/login` | — | Verificar contraseña |
| GET | `/api/export` | No | Descargar backup JSON |
| POST | `/api/import` | Sí | Restaurar backup |
