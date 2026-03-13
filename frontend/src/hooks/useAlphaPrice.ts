import { useState, useEffect } from 'react';
import { fetchAlphaPrice } from '../utils/alphaPrice';

const REFRESH_INTERVAL = parseInt(import.meta.env.VITE_ALPHA_PRICE_REFRESH || '60000');

export function useAlphaPrice() {
  const [alphaPrice, setAlphaPrice] = useState<number>(0.05); // Default price
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrice = async () => {
    try {
      const price = await fetchAlphaPrice();
      setAlphaPrice(price);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch Alpha price:', err);
      setError(err.message || 'Failed to fetch Alpha price');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchPrice();

    // Set up polling
    const interval = setInterval(fetchPrice, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return {
    alphaPrice,
    isLoading,
    error,
    refresh: fetchPrice
  };
}
