import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-xl font-semibold">List not found</h1>
      <p className="mt-2 text-sm text-muted">It doesn&apos;t exist, or it hasn&apos;t been shared with you.</p>
      <Link href="/" className="btn mt-6">
        Back to your lists
      </Link>
    </div>
  );
}
