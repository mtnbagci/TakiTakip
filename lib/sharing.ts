import { supabase } from './supabase';

export type ShareStatus = 'pending' | 'accepted' | 'declined';

export type OutgoingShare = {
  id: string;
  recipient_id: string;
  recipient_email: string;
  status: ShareStatus;
  created_at: string;
};

export type IncomingShare = {
  id: string;
  owner_id: string;
  owner_email: string;
  owner_name: string | null;
  status: ShareStatus;
  created_at: string;
};

export const createShare = async (recipientEmail: string) => {
  if (!supabase) {
    throw new Error('Supabase yapılandırılmamış.');
  }

  const { error } = await supabase.rpc('create_share', {
    recipient_email: recipientEmail,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const getOutgoingShares = async (ownerId: string): Promise<OutgoingShare[]> => {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('shares')
    .select('id, recipient_id, recipient_email, status, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const getIncomingShares = async (): Promise<IncomingShare[]> => {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('get_incoming_shares');

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const respondToShare = async (shareId: string, accept: boolean) => {
  if (!supabase) {
    throw new Error('Supabase yapılandırılmamış.');
  }

  const { error } = await supabase
    .from('shares')
    .update({
      status: accept ? 'accepted' : 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', shareId);

  if (error) {
    throw error;
  }
};

export const revokeShare = async (shareId: string) => {
  if (!supabase) {
    throw new Error('Supabase yapılandırılmamış.');
  }

  const { error } = await supabase.from('shares').delete().eq('id', shareId);

  if (error) {
    throw error;
  }
};
