import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const getAuthRedirectUrl = () => Linking.createURL('auth/callback');

export const sendMagicLink = async (email: string, name?: string) => {
  if (!supabase) {
    throw new Error('Supabase yapılandırılmamış.');
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: name ? { name } : undefined,
    },
  });

  if (error) {
    throw error;
  }
};

const extractAuthParams = (url: string): Record<string, string> => {
  const fragment = url.split('#')[1];
  const query = url.split('?')[1]?.split('#')[0];
  const params = new URLSearchParams(fragment || query || '');
  return Object.fromEntries(params.entries());
};

export const isAuthRedirectUrl = (url: string) => {
  const params = extractAuthParams(url);
  return Boolean(params.code || (params.access_token && params.refresh_token));
};

export const createSessionFromUrl = async (url: string) => {
  if (!supabase) {
    return;
  }

  const params = extractAuthParams(url);

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      throw error;
    }
    return;
  }

  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) {
      throw error;
    }
  }
};

export const signInWithPassword = async (email: string, password: string) => {
  if (!supabase) {
    throw new Error('Supabase yapılandırılmamış.');
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
};

export const signUpWithPassword = async (email: string, password: string, name?: string) => {
  if (!supabase) {
    throw new Error('Supabase yapılandırılmamış.');
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: name ? { name } : undefined,
    },
  });
  if (error) {
    throw error;
  }
};

export const signInWithGoogle = async () => {
  if (!supabase) {
    throw new Error('Supabase yapılandırılmamış.');
  }

  const redirectTo = getAuthRedirectUrl();

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      throw error;
    }
    return;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error) {
    throw error;
  }
  if (!data.url) {
    throw new Error('Giriş bağlantısı oluşturulamadı.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'success' && result.url) {
    await createSessionFromUrl(result.url);
  }
};

export const signOut = async () => {
  if (!supabase) {
    return;
  }
  await supabase.auth.signOut();
};

export const deleteAccount = async () => {
  if (!supabase) {
    throw new Error('Supabase yapılandırılmamış.');
  }

  const { error } = await supabase.rpc('delete_own_account');
  if (error) {
    throw error;
  }

  await supabase.auth.signOut();
};
