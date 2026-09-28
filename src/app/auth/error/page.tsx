import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-xl font-semibold">That link didn&apos;t work</h1>
      <p className="mt-2 text-sm text-muted">
        It may have expired or already been used. Email links are single-use and last an hour.
      </p>
      <Link href="/login" className="btn mt-6">
        Back to sign in
      </Link>
    </div>
  );
}
