import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Gift, Copy, Share2, Check, MessageCircle } from "lucide-react";

interface ReferralInfo {
  code: string;
  invited: number;
  waiting: number;
  credits: number;
  used: number;
  discountPercent: number;
  perReferralPercent: number;
  maxDiscountPercent: number;
}

export function ReferralCard() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError } = useQuery<ReferralInfo>({ queryKey: ["/api/referrals/me"] });

  if (isLoading || isError || !data) return null;

  const link = `${window.location.origin}/auth?ref=${data.code}`;
  const message =
    `Main BullWiser use kar raha hoon – AI + Vedic astrology + statistics se stock aur crypto predictions milte hain. ` +
    `Mere link se join karo: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy nahi hua", description: link });
    }
  };
  const share = async () => {
    const nav = navigator as any;
    if (nav.share) {
      try { await nav.share({ title: "BullWiser", text: message, url: link }); } catch { /* user closed the sheet */ }
    } else {
      copy();
    }
  };

  return (
    <Card className="border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50" data-testid="card-referral">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5 text-amber-600" />
          Refer a friend, get {data.perReferralPercent}% off
        </CardTitle>
        <CardDescription>
          Jab aapka dost apna pehla payment karta hai, aapko agle payment par {data.perReferralPercent}% discount milta hai
          (max {data.maxDiscountPercent}%). Sirf sign-up par discount nahi milta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
          <span className="text-xs text-gray-500">Your code</span>
          <span className="font-mono font-semibold tracking-widest" data-testid="text-referral-code">{data.code}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-share-whatsapp"
          >
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
            </a>
          </Button>
          <Button variant="outline" onClick={share} data-testid="button-share">
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
          <Button variant="outline" onClick={copy} data-testid="button-copy-referral">
            {copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-white p-2 border">
            <div className="text-xl font-bold" data-testid="text-referral-invited">{data.invited}</div>
            <div className="text-xs text-gray-500">Friends joined</div>
          </div>
          <div className="rounded-md bg-white p-2 border">
            <div className="text-xl font-bold">{data.credits + data.used}</div>
            <div className="text-xs text-gray-500">Friends paid</div>
          </div>
          <div className="rounded-md bg-white p-2 border">
            <div className="text-xl font-bold text-green-600" data-testid="text-referral-discount">{data.discountPercent}%</div>
            <div className="text-xs text-gray-500">Off your next payment</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
