import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const { toast } = useToast();

  useEffect(() => {
    // Check if push notifications are supported
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPush = async () => {
    if (!isSupported) {
      toast({
        title: 'Not Supported',
        description: 'Push notifications are not supported in your browser',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission !== 'granted') {
        toast({
          title: 'Permission Denied',
          description: 'Please enable notifications to receive alerts',
          variant: 'destructive'
        });
        return;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      
      // Create push subscription
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          import.meta.env.VITE_VAPID_PUBLIC_KEY || 
          'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qJvSLeYAl61wiIuY5NDQ'
        )
      });

      setSubscription(sub);

      // Send subscription to backend
      await apiRequest('POST', '/api/notifications/subscribe', {
        subscription: sub.toJSON()
      });

      toast({
        title: 'Notifications Enabled',
        description: 'You will now receive push notifications for important alerts'
      });

    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      toast({
        title: 'Subscription Failed',
        description: 'Could not enable push notifications',
        variant: 'destructive'
      });
    }
  };

  const unsubscribeFromPush = async () => {
    if (subscription) {
      try {
        await subscription.unsubscribe();
        
        // Notify backend
        await apiRequest('POST', '/api/notifications/unsubscribe', {
          subscription: subscription.toJSON()
        });

        setSubscription(null);
        
        toast({
          title: 'Notifications Disabled',
          description: 'You will no longer receive push notifications'
        });
      } catch (error) {
        console.error('Error unsubscribing from push notifications:', error);
        toast({
          title: 'Unsubscribe Failed',
          description: 'Could not disable push notifications',
          variant: 'destructive'
        });
      }
    }
  };

  const sendTestNotification = async () => {
    if (permission === 'granted') {
      // Send test notification request to backend
      await apiRequest('POST', '/api/notifications/test', {});
      
      toast({
        title: 'Test Sent',
        description: 'You should receive a test notification shortly'
      });
    }
  };

  return {
    isSupported,
    permission,
    subscription,
    subscribeToPush,
    unsubscribeFromPush,
    sendTestNotification
  };
}