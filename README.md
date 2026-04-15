# Tic Tac Toe Online
Link para jugar : 
https://tic-tac-toe-kappa-seven-35.vercel.app/?room=

Tic Tac Toe en React + Vite con salas compartidas en tiempo real usando Supabase.

## Desarrollo local

1. Copia `.env.example` a `.env`.
2. Coloca tus credenciales:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

3. Instala dependencias y levanta la app:

```bash
npm install
npm start
```

## Configuracion de Supabase

1. Crea un proyecto en Supabase.
2. Ve a `SQL Editor`.
3. Ejecuta el contenido de [schema.sql](/D:/Practicas Personales/React/projects/02-tic-tac-toe/supabase/schema.sql).
   Si ya habias creado la tabla antes, vuelve a ejecutarlo: este script tambien actua como migracion.
4. Ve a `Settings > API` y copia:
   - `Project URL`
   - `Publishable key`
5. Pega esos valores en `.env` y tambien en las variables de entorno de Vercel.

## Despliegue en Vercel

1. Abre tu proyecto en Vercel.
2. Ve a `Settings > Environment Variables`.
3. Agrega `VITE_SUPABASE_URL`.
4. Agrega `VITE_SUPABASE_ANON_KEY`.
5. Redeploy.

## Como jugar

1. Abre la app.
2. Copia el enlace de la sala.
3. Enviaselo a tu pareja.
4. El primer navegador entra como anfitrion.
5. El segundo entra como invitado.
6. El anfitrion puede elegir:
   - su nombre
   - si quiere ser `X` u `O`
   - si empieza `X` u `O`

El invitado tambien puede guardar su nombre.
