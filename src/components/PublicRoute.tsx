import React, { FC, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLoadingScreen } from './AuthLoadingScreen';

interface PublicRouteProps {
  children: ReactNode;
}

export const PublicRoute: FC<PublicRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen message="Checking authentication..." />;
  }

  if (user) {
    // Already authenticated, navigate to intended route or dashboard (protecting rooms behind dashboard join flow)
    const from = (location.state as any)?.from;
    let destination = '/dashboard';
    if (from) {
      const pathname = typeof from === 'string' ? from : from.pathname || '/dashboard';
      const search = typeof from === 'object' && from.search ? from.search : '';
      if (pathname.startsWith('/room/')) {
        const rId = pathname.replace('/room/', '').split('/')[0];
        destination = `/dashboard?room=${encodeURIComponent(rId)}`;
      } else if (pathname.startsWith('/join/')) {
        const rCode = pathname.replace('/join/', '').split('/')[0];
        destination = `/dashboard?room=${encodeURIComponent(rCode)}`;
      } else if (pathname === '/join' || pathname === '/join/') {
        const params = new URLSearchParams(search);
        const room = params.get('room');
        destination = room ? `/dashboard?room=${encodeURIComponent(room)}` : '/dashboard';
      } else {
        destination = pathname;
      }
    }
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
};
