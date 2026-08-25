import Container from '@/components/Container';
import AppGrid from '@/components/AppGrid';
import { ComponentProps } from 'react';
import AdminInfoContentReady from './AdminInfoContentReady';

export default function AdminInfoPage({
  children,
  ...props
}: Omit<ComponentProps<typeof AppGrid>, 'contentMain'>) {
  return (
    <AppGrid
      {...props}
      contentMain={
        <Container spaceChildren={false}>
          {children}
          <AdminInfoContentReady />
        </Container>}
    />
  );
}
