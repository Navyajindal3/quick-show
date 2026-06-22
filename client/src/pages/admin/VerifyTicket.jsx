import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { CheckCircle, XCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import Spinner from '../../components/common/Spinner';

export default function VerifyTicket() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'warning', 'error'
  const [bookingData, setBookingData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyTicket = async () => {
      try {
        const { data } = await api.put(`/bookings/verify/${id}`);
        setBookingData(data.booking);
        setStatus('success');
      } catch (error) {
        if (error.response?.status === 400 && error.response?.data?.message.includes('already been scanned')) {
          setStatus('warning');
          setErrorMessage(error.response.data.message);
        } else {
          setStatus('error');
          setErrorMessage(error.response?.data?.message || 'Invalid Ticket');
        }
      }
    };

    verifyTicket();
  }, [id]);

  const handleGoBack = () => {
    navigate('/admin');
  };

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f' }}>
        <Spinner text="Verifying Ticket..." />
      </div>
    );
  }

  // Define themes based on status
  const theme = {
    success: {
      bg: '#064e3b', // Dark green
      icon: <CheckCircle size={80} color="#34d399" />,
      title: 'VALID TICKET',
      titleColor: '#34d399',
    },
    warning: {
      bg: '#7f1d1d', // Dark red
      icon: <AlertTriangle size={80} color="#fca5a5" />,
      title: 'ALREADY SCANNED',
      titleColor: '#fca5a5',
    },
    error: {
      bg: '#450a0a', // Very dark red
      icon: <XCircle size={80} color="#ef4444" />,
      title: 'INVALID TICKET',
      titleColor: '#ef4444',
    },
  }[status];

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      textAlign: 'center',
      color: 'white',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ marginBottom: 32 }}>
        {theme.icon}
      </div>
      
      <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: 2, color: theme.titleColor, marginBottom: 16 }}>
        {theme.title}
      </h1>

      {status === 'success' && bookingData && (
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: 24,
          borderRadius: 16,
          width: '100%',
          maxWidth: 400,
          marginTop: 24,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{bookingData.show?.movie?.title}</h2>
          <p style={{ fontSize: 16, color: '#d1d5db', marginBottom: 16 }}>{bookingData.show?.theatre?.name}</p>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16, marginTop: 16 }}>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase' }}>Customer</p>
              <p style={{ fontSize: 16, fontWeight: 600 }}>{bookingData.user?.name}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase' }}>Seats ({bookingData.seatsSelected.length})</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#34d399' }}>{bookingData.seatsSelected.join(', ')}</p>
            </div>
          </div>
        </div>
      )}

      {(status === 'warning' || status === 'error') && (
        <div style={{
          background: 'rgba(0,0,0,0.4)',
          padding: 20,
          borderRadius: 12,
          marginTop: 24,
          maxWidth: 400,
          width: '100%'
        }}>
          <p style={{ fontSize: 16, color: '#fca5a5', lineHeight: 1.5 }}>
            {errorMessage}
          </p>
        </div>
      )}

      <button onClick={handleGoBack} style={{
        marginTop: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.2)',
        border: 'none',
        color: 'white',
        padding: '12px 24px',
        borderRadius: 30,
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer'
      }}>
        <ArrowLeft size={20} /> Back to Dashboard
      </button>
    </div>
  );
}
