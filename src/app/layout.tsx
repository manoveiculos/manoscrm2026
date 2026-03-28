import { LayoutWrapperV2 } from '@/components/v2/LayoutWrapperV2';

export default function V2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LayoutWrapperV2>{children}</LayoutWrapperV2>
  );
}
