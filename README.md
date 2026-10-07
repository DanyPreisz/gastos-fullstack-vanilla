# Gastos

CRUD de gastos, busqueda, categorias y total por usuario.

- Frontend vanilla
- Node nativo
- MongoDB
- Cloud Run

```bash
export MONGODB_URI="mongodb+srv://..."
export MONGODB_DB=gastos
npm install
node server/index.js
```

Deploy:

```bash
export MONGODB_URI="mongodb+srv://..."
./deploy-cloud-run.sh
```
