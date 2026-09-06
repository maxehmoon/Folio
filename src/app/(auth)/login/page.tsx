import { redirect } from "next/navigation"

type LoginAliasPageProps = {
  searchParams: Promise<{ next?: string | string[] }>
}

export default async function LoginAliasPage({ searchParams }: LoginAliasPageProps) {
  const params = await searchParams
  const next = Array.isArray(params.next) ? params.next[0] : params.next
  const query = next ? `?next=${encodeURIComponent(next)}` : ""
  redirect(`/sign-in${query}`)
}
