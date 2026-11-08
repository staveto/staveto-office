"use client";

import { useState } from "react";
import { SUPPORT_EMAIL } from "@/lib/marketingLinks";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const subject = encodeURIComponent(`Staveto website — ${name || "message"}`);
    const body = encodeURIComponent(`${message}\n\nFrom: ${name}\nEmail: ${email}`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="marketing-contact-form">
      <div>
        <label htmlFor="contact-name" className="text-sm font-medium text-[#1D376A]">
          Name
        </label>
        <input
          id="contact-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#D8E1EA] px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="text-sm font-medium text-[#1D376A]">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#D8E1EA] px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="text-sm font-medium text-[#1D376A]">
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#D8E1EA] px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        className="rounded-full bg-[#e06737] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c9582f]"
      >
        Send message
      </button>
      <p className="text-xs text-[#64748B]">
        Opens your email app to {SUPPORT_EMAIL}. We do not store this form on the server.
      </p>
    </form>
  );
}
