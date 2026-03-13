/**
 * Кнопка «Назад» — только иконка стрелки
 */
import { useNavigate } from 'react-router-dom';

const BackIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

export default function BackButton({ onClick, to, className = '', ...rest }) {
  const navigate = useNavigate();
  const handleClick = onClick ?? (to != null ? () => navigate(to) : () => navigate(-1));
  return (
    <button
      type="button"
      onClick={handleClick}
      title="Назад"
      className={`inline-flex items-center justify-center w-10 h-10 rounded-lg hover:opacity-90 transition-opacity ${className}`}
      {...rest}
    >
      <BackIcon />
    </button>
  );
}
