This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, set up your environment:

1. Copy `.env.template` to `.env.local` and fill in your credentials
2. Create a Supabase project at [supabase.com](https://supabase.com)
3. Set up your database and storage (see Supabase Setup below)

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase Setup

This project uses Supabase for database and storage. Follow these steps to set up your Supabase project:

1. Create a new project at [supabase.com](https://supabase.com)
2. Get your project URL and API keys from the Supabase dashboard
3. Add them to your `.env.local` file:

```bash
# Database URL - Replace with your Supabase PostgreSQL connection string
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Supabase credentials
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[YOUR-SUPABASE-ANON-KEY]"
SUPABASE_SERVICE_ROLE_KEY="[YOUR-SUPABASE-SERVICE-ROLE-KEY]"
```

4. Run the Supabase setup script to create the required storage buckets:

```bash
node scripts/setup-supabase.js
```

5. Generate the Prisma client:

```bash
npx prisma generate
```

6. Apply the database schema:

```bash
npx prisma db push
```

## Code Quality

This project uses ESLint for linting and Prettier for code formatting.

```bash
# Run ESLint check
npm run lint

# Fix ESLint issues
npm run lint:fix

# Format code with Prettier
npm run format

# Run both lint:fix and format
npm run fix
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

### Netlify Deployment

This project is configured for deployment on Netlify. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

**Quick setup for Netlify:**

1. Connect your repository to Netlify
2. Set the required environment variables (especially `NEXTAUTH_URL` and `NEXTAUTH_SECRET`)
3. Deploy!

**Generate a secure NextAuth secret:**
```bash
node scripts/generate-nextauth-secret.js
```

### Deploy on Vercel

You can also deploy on Vercel using the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
