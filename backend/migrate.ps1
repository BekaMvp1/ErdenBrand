$env:DATABASE_URL="postgresql://neondb_owner:npg_2yDEHgRQkV7B@ep-cool-mountain-aml24urv-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
$env:NODE_ENV="production"
npx sequelize-cli db:migrate
