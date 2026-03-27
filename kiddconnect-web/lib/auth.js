import Cookies from 'js-cookie';
import { authAPI } from './api';

export const setToken = (token) => {
  Cookies.set('token', token, { expires: 7 });
};

export const getToken = () => {
  return Cookies.get('token');
};

export const removeToken = () => {
  Cookies.remove('token');
};

export const isAuthenticated = () => {
  return !!getToken();
};

export const login = async (email, password) => {
  try {
    console.log('[Auth] Attempting login for:', email);
    const response = await authAPI.login({ email, password });
    console.log('[Auth] Login response:', response);
    const { token } = response.data;
    if (!token) {
      console.error('[Auth] No token in response:', response.data);
      throw new Error('No authentication token received');
    }
    setToken(token);
    console.log('[Auth] Login successful, token set');
    return response.data;
  } catch (error) {
    console.error('[Auth] Login error:', error);
    console.error('[Auth] Error response:', error.response);
    console.error('[Auth] Error message:', error.message);
    throw error; // Re-throw to let the component handle it
  }
};

export const signup = async (data) => {
  const response = await authAPI.signup(data);
  const { token, activation } = response.data;
  if (token) {
    setToken(token);
  }
  return { ...response.data, activation }; // Include activation data in response
};

export const logout = async () => {
  try {
    await authAPI.logout();
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    removeToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
};

