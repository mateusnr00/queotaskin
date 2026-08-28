"use client";

import { useState } from "react";
import { Check, Copy, Send, Share2 } from "lucide-react";

import { IconeDoWhatsapp } from "@/components/icones/whatsapp";

import { cn } from "@/lib/utils";

interface SocialShareProps {
  url: string;
  title: string;
}

// Botões de compartilhar. WhatsApp + Telegram + Copiar Link são os mais
// usados em compartilhamento de rifa no Brasil; mantenho FB/Twitter como
// secundários. Visibilidade controlada pelo admin via showShareButtons.
export function SocialShare({ url, title }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(title);

  const items = [
    {
      name: "WhatsApp",
      href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      icon: IconeDoWhatsapp,
      cls: "bg-[#25D366] hover:bg-[#25D366]/90 text-white",
    },
    {
      name: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      icon: Send,
      cls: "bg-[#0088CC] hover:bg-[#0088CC]/90 text-white",
    },
    {
      name: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: Share2,
      cls: "bg-[#1877F2] hover:bg-[#1877F2]/90 text-white",
    },
  ] as const;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silencioso
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.name}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Compartilhar no ${item.name}`}
            title={`Compartilhar no ${item.name}`}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
              item.cls
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{item.name}</span>
          </a>
        );
      })}
      <button
        type="button"
        onClick={copyLink}
        aria-label="Copiar link"
        title="Copiar link"
        className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors hover:bg-muted"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-green-600" />
            <span className="hidden sm:inline">Copiado!</span>
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">Copiar link</span>
          </>
        )}
      </button>
    </div>
  );
}
