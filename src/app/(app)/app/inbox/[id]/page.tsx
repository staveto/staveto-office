import { EmailInquiryDetailPage } from "@/components/inbox/EmailInquiryDetailPage";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function InboxDetailRoutePage({ params }: Props) {
  const { id } = await params;
  return <EmailInquiryDetailPage inquiryId={id} />;
}
