import { Suspense } from "react";
import AccountClient from "./AccountClient";

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading account...</div>}>
      <AccountClient />
    </Suspense>
  );
}