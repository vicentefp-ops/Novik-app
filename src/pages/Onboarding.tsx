import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Stethoscope, ShieldCheck, Loader2, ChevronDown, Search } from 'lucide-react';
import { serverTimestamp } from 'firebase/firestore';

// import logo from '../assets/logo_new.png'; // Removed in favor of public/logo.png

const COUNTRIES = [
  { code: 'AF', nameEs: 'Afganistán', nameEn: 'Afghanistan', flag: '🇦🇫' },
  { code: 'AL', nameEs: 'Albania', nameEn: 'Albania', flag: '🇦🇱' },
  { code: 'DE', nameEs: 'Alemania', nameEn: 'Germany', flag: '🇩🇪' },
  { code: 'AD', nameEs: 'Andorra', nameEn: 'Andorra', flag: '🇦🇩' },
  { code: 'AO', nameEs: 'Angola', nameEn: 'Angola', flag: '🇦🇴' },
  { code: 'AI', nameEs: 'Anguila', nameEn: 'Anguilla', flag: '🇦🇮' },
  { code: 'AQ', nameEs: 'Antártida', nameEn: 'Antarctica', flag: '🇦🇶' },
  { code: 'AG', nameEs: 'Antigua y Barbuda', nameEn: 'Antigua and Barbuda', flag: '🇦🇬' },
  { code: 'SA', nameEs: 'Arabia Saudita', nameEn: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'DZ', nameEs: 'Argelia', nameEn: 'Algeria', flag: '🇩🇿' },
  { code: 'AR', nameEs: 'Argentina', nameEn: 'Argentina', flag: '🇦🇷' },
  { code: 'AM', nameEs: 'Armenia', nameEn: 'Armenia', flag: '🇦🇲' },
  { code: 'AW', nameEs: 'Aruba', nameEn: 'Aruba', flag: '🇦🇼' },
  { code: 'AU', nameEs: 'Australia', nameEn: 'Australia', flag: '🇦🇺' },
  { code: 'AT', nameEs: 'Austria', nameEn: 'Austria', flag: '🇦🇹' },
  { code: 'AZ', nameEs: 'Azerbaiyán', nameEn: 'Azerbaijan', flag: '🇦🇿' },
  { code: 'BS', nameEs: 'Bahamas', nameEn: 'Bahamas', flag: '🇧🇸' },
  { code: 'BD', nameEs: 'Bangladés', nameEn: 'Bangladesh', flag: '🇧🇩' },
  { code: 'BB', nameEs: 'Barbados', nameEn: 'Barbados', flag: '🇧🇧' },
  { code: 'BH', nameEs: 'Baréin', nameEn: 'Bahrain', flag: '🇧🇭' },
  { code: 'BE', nameEs: 'Bélgica', nameEn: 'Belgium', flag: '🇧🇪' },
  { code: 'BZ', nameEs: 'Belice', nameEn: 'Belize', flag: '🇧🇿' },
  { code: 'BJ', nameEs: 'Benín', nameEn: 'Benin', flag: '🇧🇯' },
  { code: 'BM', nameEs: 'Bermudas', nameEn: 'Bermuda', flag: '🇧🇲' },
  { code: 'BY', nameEs: 'Bielorrusia', nameEn: 'Belarus', flag: '🇧🇾' },
  { code: 'MM', nameEs: 'Birmania', nameEn: 'Myanmar', flag: '🇲🇲' },
  { code: 'BO', nameEs: 'Bolivia', nameEn: 'Bolivia', flag: '🇧🇴' },
  { code: 'BA', nameEs: 'Bosnia y Herzegovina', nameEn: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  { code: 'BW', nameEs: 'Botsuana', nameEn: 'Botswana', flag: '🇧🇼' },
  { code: 'BR', nameEs: 'Brasil', nameEn: 'Brazil', flag: '🇧🇷' },
  { code: 'BN', nameEs: 'Brunéi', nameEn: 'Brunei', flag: '🇧🇳' },
  { code: 'BG', nameEs: 'Bulgaria', nameEn: 'Bulgaria', flag: '🇧🇬' },
  { code: 'BF', nameEs: 'Burkina Faso', nameEn: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'BI', nameEs: 'Burundi', nameEn: 'Burundi', flag: '🇧🇮' },
  { code: 'BT', nameEs: 'Bután', nameEn: 'Bhutan', flag: '🇧🇹' },
  { code: 'CV', nameEs: 'Cabo Verde', nameEn: 'Cape Verde', flag: '🇨🇻' },
  { code: 'KH', nameEs: 'Camboya', nameEn: 'Cambodia', flag: '🇰🇭' },
  { code: 'CM', nameEs: 'Camerún', nameEn: 'Cameroon', flag: '🇨🇲' },
  { code: 'CA', nameEs: 'Canadá', nameEn: 'Canada', flag: '🇨🇦' },
  { code: 'QA', nameEs: 'Catar', nameEn: 'Qatar', flag: '🇶🇦' },
  { code: 'TD', nameEs: 'Chad', nameEn: 'Chad', flag: '🇹🇩' },
  { code: 'CL', nameEs: 'Chile', nameEn: 'Chile', flag: '🇨🇱' },
  { code: 'CN', nameEs: 'China', nameEn: 'China', flag: '🇨🇳' },
  { code: 'CY', nameEs: 'Chipre', nameEn: 'Cyprus', flag: '🇨🇾' },
  { code: 'VA', nameEs: 'Ciudad del Vaticano', nameEn: 'Vatican City', flag: '🇻🇦' },
  { code: 'CO', nameEs: 'Colombia', nameEn: 'Colombia', flag: '🇨🇴' },
  { code: 'KM', nameEs: 'Comoras', nameEn: 'Comoros', flag: '🇰🇲' },
  { code: 'KP', nameEs: 'Corea del Norte', nameEn: 'North Korea', flag: '🇰🇵' },
  { code: 'KR', nameEs: 'Corea del Sur', nameEn: 'South Korea', flag: '🇰🇷' },
  { code: 'CI', nameEs: 'Costa de Marfil', nameEn: 'Ivory Coast', flag: '🇨🇮' },
  { code: 'CR', nameEs: 'Costa Rica', nameEn: 'Costa Rica', flag: '🇨🇷' },
  { code: 'HR', nameEs: 'Croacia', nameEn: 'Croatia', flag: '🇭🇷' },
  { code: 'CU', nameEs: 'Cuba', nameEn: 'Cuba', flag: '🇨🇺' },
  { code: 'DK', nameEs: 'Dinamarca', nameEn: 'Denmark', flag: '🇩🇰' },
  { code: 'DM', nameEs: 'Dominica', nameEn: 'Dominica', flag: '🇩🇲' },
  { code: 'EC', nameEs: 'Ecuador', nameEn: 'Ecuador', flag: '🇪🇨' },
  { code: 'EG', nameEs: 'Egipto', nameEn: 'Egypt', flag: '🇪🇬' },
  { code: 'SV', nameEs: 'El Salvador', nameEn: 'El Salvador', flag: '🇸🇻' },
  { code: 'AE', nameEs: 'Emiratos Árabes Unidos', nameEn: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'ER', nameEs: 'Eritrea', nameEn: 'Eritrea', flag: '🇪🇷' },
  { code: 'SK', nameEs: 'Eslovaquia', nameEn: 'Slovakia', flag: '🇸🇰' },
  { code: 'SI', nameEs: 'Eslovenia', nameEn: 'Slovenia', flag: '🇸🇮' },
  { code: 'ES', nameEs: 'España', nameEn: 'Spain', flag: '🇪🇸' },
  { code: 'US', nameEs: 'Estados Unidos', nameEn: 'United States', flag: '🇺🇸' },
  { code: 'EE', nameEs: 'Estonia', nameEn: 'Estonia', flag: '🇪🇪' },
  { code: 'ET', nameEs: 'Etiopía', nameEn: 'Ethiopia', flag: '🇪🇹' },
  { code: 'PH', nameEs: 'Filipinas', nameEn: 'Philippines', flag: '🇵🇭' },
  { code: 'FI', nameEs: 'Finlandia', nameEn: 'Finland', flag: '🇫🇮' },
  { code: 'FJ', nameEs: 'Fiyi', nameEn: 'Fiji', flag: '🇫🇯' },
  { code: 'FR', nameEs: 'Francia', nameEn: 'France', flag: '🇫🇷' },
  { code: 'GA', nameEs: 'Gabón', nameEn: 'Gabon', flag: '🇬🇦' },
  { code: 'GM', nameEs: 'Gambia', nameEn: 'Gambia', flag: '🇬🇲' },
  { code: 'GE', nameEs: 'Georgia', nameEn: 'Georgia', flag: '🇬🇪' },
  { code: 'GH', nameEs: 'Ghana', nameEn: 'Ghana', flag: '🇬🇭' },
  { code: 'GI', nameEs: 'Gibraltar', nameEn: 'Gibraltar', flag: '🇬🇮' },
  { code: 'GD', nameEs: 'Granada', nameEn: 'Grenada', flag: '🇬🇩' },
  { code: 'GR', nameEs: 'Grecia', nameEn: 'Greece', flag: '🇬🇷' },
  { code: 'GL', nameEs: 'Groenlandia', nameEn: 'Greenland', flag: '🇬🇱' },
  { code: 'GT', nameEs: 'Guatemala', nameEn: 'Guatemala', flag: '🇬🇹' },
  { code: 'GQ', nameEs: 'Guinea Ecuatorial', nameEn: 'Equatorial Guinea', flag: '🇬🇶' },
  { code: 'GN', nameEs: 'Guinea', nameEn: 'Guinea', flag: '🇬🇳' },
  { code: 'GW', nameEs: 'Guinea-Bisáu', nameEn: 'Guinea-Bissau', flag: '🇬🇼' },
  { code: 'GY', nameEs: 'Guyana', nameEn: 'Guyana', flag: '🇬🇾' },
  { code: 'HT', nameEs: 'Haití', nameEn: 'Haiti', flag: '🇭🇹' },
  { code: 'HN', nameEs: 'Honduras', nameEn: 'Honduras', flag: '🇭🇳' },
  { code: 'HU', nameEs: 'Hungría', nameEn: 'Hungary', flag: '🇭🇺' },
  { code: 'IN', nameEs: 'India', nameEn: 'India', flag: '🇮🇳' },
  { code: 'ID', nameEs: 'Indonesia', nameEn: 'Indonesia', flag: '🇮🇩' },
  { code: 'IQ', nameEs: 'Irak', nameEn: 'Iraq', flag: '🇮🇶' },
  { code: 'IR', nameEs: 'Irán', nameEn: 'Iran', flag: '🇮🇷' },
  { code: 'IE', nameEs: 'Irlanda', nameEn: 'Ireland', flag: '🇮🇪' },
  { code: 'IS', nameEs: 'Islandia', nameEn: 'Iceland', flag: '🇮🇸' },
  { code: 'IL', nameEs: 'Israel', nameEn: 'Israel', flag: '🇮🇱' },
  { code: 'IT', nameEs: 'Italia', nameEn: 'Italy', flag: '🇮🇹' },
  { code: 'JM', nameEs: 'Jamaica', nameEn: 'Jamaica', flag: '🇯🇲' },
  { code: 'JP', nameEs: 'Japón', nameEn: 'Japan', flag: '🇯🇵' },
  { code: 'JO', nameEs: 'Jordania', nameEn: 'Jordan', flag: '🇯🇴' },
  { code: 'KZ', nameEs: 'Kazajistán', nameEn: 'Kazakhstan', flag: '🇰🇿' },
  { code: 'KE', nameEs: 'Kenia', nameEn: 'Kenya', flag: '🇰🇪' },
  { code: 'KG', nameEs: 'Kirguistán', nameEn: 'Kyrgyzstan', flag: '🇰🇬' },
  { code: 'KI', nameEs: 'Kiribati', nameEn: 'Kiribati', flag: '🇰🇮' },
  { code: 'KW', nameEs: 'Kuwait', nameEn: 'Kuwait', flag: '🇰🇼' },
  { code: 'LA', nameEs: 'Laos', nameEn: 'Laos', flag: '🇱🇦' },
  { code: 'LS', nameEs: 'Lesoto', nameEn: 'Lesotho', flag: '🇱🇸' },
  { code: 'LV', nameEs: 'Letonia', nameEn: 'Latvia', flag: '🇱🇻' },
  { code: 'LB', nameEs: 'Líbano', nameEn: 'Lebanon', flag: '🇱🇧' },
  { code: 'LR', nameEs: 'Liberia', nameEn: 'Liberia', flag: '🇱🇷' },
  { code: 'LY', nameEs: 'Libia', nameEn: 'Libya', flag: '🇱🇾' },
  { code: 'LI', nameEs: 'Liechtenstein', nameEn: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'LT', nameEs: 'Lituania', nameEn: 'Lithuania', flag: '🇱🇹' },
  { code: 'LU', nameEs: 'Luxemburgo', nameEn: 'Luxembourg', flag: '🇱🇺' },
  { code: 'MK', nameEs: 'Macedonia del Norte', nameEn: 'North Macedonia', flag: '🇲🇰' },
  { code: 'MG', nameEs: 'Madagascar', nameEn: 'Madagascar', flag: '🇲🇬' },
  { code: 'MY', nameEs: 'Malasia', nameEn: 'Malaysia', flag: '🇲🇾' },
  { code: 'MW', nameEs: 'Malaui', nameEn: 'Malawi', flag: '🇲🇼' },
  { code: 'MV', nameEs: 'Maldivas', nameEn: 'Maldives', flag: '🇲🇻' },
  { code: 'ML', nameEs: 'Malí', nameEn: 'Mali', flag: '🇲🇱' },
  { code: 'MT', nameEs: 'Malta', nameEn: 'Malta', flag: '🇲🇹' },
  { code: 'MA', nameEs: 'Marruecos', nameEn: 'Morocco', flag: '🇲🇦' },
  { code: 'MU', nameEs: 'Mauricio', nameEn: 'Mauritius', flag: '🇲🇺' },
  { code: 'MR', nameEs: 'Mauritania', nameEn: 'Mauritania', flag: '🇲🇷' },
  { code: 'MX', nameEs: 'México', nameEn: 'Mexico', flag: '🇲🇽' },
  { code: 'FM', nameEs: 'Micronesia', nameEn: 'Micronesia', flag: '🇫🇲' },
  { code: 'MD', nameEs: 'Moldavia', nameEn: 'Moldova', flag: '🇲🇩' },
  { code: 'MC', nameEs: 'Mónaco', nameEn: 'Monaco', flag: '🇲🇨' },
  { code: 'MN', nameEs: 'Mongolia', nameEn: 'Mongolia', flag: '🇲🇳' },
  { code: 'ME', nameEs: 'Montenegro', nameEn: 'Montenegro', flag: '🇲🇪' },
  { code: 'MZ', nameEs: 'Mozambique', nameEn: 'Mozambique', flag: '🇲🇿' },
  { code: 'NA', nameEs: 'Namibia', nameEn: 'Namibia', flag: '🇳🇦' },
  { code: 'NR', nameEs: 'Nauru', nameEn: 'Nauru', flag: '🇳🇷' },
  { code: 'NP', nameEs: 'Nepal', nameEn: 'Nepal', flag: '🇳🇵' },
  { code: 'NI', nameEs: 'Nicaragua', nameEn: 'Nicaragua', flag: '🇳🇮' },
  { code: 'NE', nameEs: 'Níger', nameEn: 'Niger', flag: '🇳🇪' },
  { code: 'NG', nameEs: 'Nigeria', nameEn: 'Nigeria', flag: '🇳🇬' },
  { code: 'NO', nameEs: 'Noruega', nameEn: 'Norway', flag: '🇳🇴' },
  { code: 'NZ', nameEs: 'Nueva Zelanda', nameEn: 'New Zealand', flag: '🇳🇿' },
  { code: 'OM', nameEs: 'Omán', nameEn: 'Oman', flag: '🇴🇲' },
  { code: 'NL', nameEs: 'Países Bajos', nameEn: 'Netherlands', flag: '🇳🇱' },
  { code: 'PK', nameEs: 'Pakistán', nameEn: 'Pakistan', flag: '🇵🇰' },
  { code: 'PW', nameEs: 'Palaos', nameEn: 'Palau', flag: '🇵🇼' },
  { code: 'PA', nameEs: 'Panamá', nameEn: 'Panama', flag: '🇵🇦' },
  { code: 'PG', nameEs: 'Papúa Nueva Guinea', nameEn: 'Papua New Guinea', flag: '🇵🇬' },
  { code: 'PY', nameEs: 'Paraguay', nameEn: 'Paraguay', flag: '🇵🇾' },
  { code: 'PE', nameEs: 'Perú', nameEn: 'Peru', flag: '🇵🇪' },
  { code: 'PL', nameEs: 'Polonia', nameEn: 'Poland', flag: '🇵🇱' },
  { code: 'PT', nameEs: 'Portugal', nameEn: 'Portugal', flag: '🇵🇹' },
  { code: 'PR', nameEs: 'Puerto Rico', nameEn: 'Puerto Rico', flag: '🇵🇷' },
  { code: 'GB', nameEs: 'Reino Unido', nameEn: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CF', nameEs: 'República Centroafricana', nameEn: 'Central African Republic', flag: '🇨🇫' },
  { code: 'CZ', nameEs: 'República Checa', nameEn: 'Czech Republic', flag: '🇨🇿' },
  { code: 'CG', nameEs: 'República del Congo', nameEn: 'Republic of the Congo', flag: '🇨🇬' },
  { code: 'CD', nameEs: 'República Democrática del Congo', nameEn: 'Democratic Republic of the Congo', flag: '🇨🇩' },
  { code: 'DO', nameEs: 'República Dominicana', nameEn: 'Dominican Republic', flag: '🇩🇴' },
  { code: 'RW', nameEs: 'Ruanda', nameEn: 'Rwanda', flag: '🇷🇼' },
  { code: 'RO', nameEs: 'Rumania', nameEn: 'Romania', flag: '🇷🇴' },
  { code: 'RU', nameEs: 'Rusia', nameEn: 'Russia', flag: '🇷🇺' },
  { code: 'WS', nameEs: 'Samoa', nameEn: 'Samoa', flag: '🇼🇸' },
  { code: 'KN', nameEs: 'San Cristóbal y Nieves', nameEn: 'Saint Kitts and Nevis', flag: '🇰🇳' },
  { code: 'SM', nameEs: 'San Marino', nameEn: 'San Marino', flag: '🇸🇲' },
  { code: 'VC', nameEs: 'San Vicente y las Granadinas', nameEn: 'Saint Vincent and the Grenadines', flag: '🇻🇨' },
  { code: 'LC', nameEs: 'Santa Lucía', nameEn: 'Saint Lucia', flag: '🇱🇨' },
  { code: 'ST', nameEs: 'Santo Tomé y Príncipe', nameEn: 'Sao Tome and Principe', flag: '🇸🇹' },
  { code: 'SN', nameEs: 'Senegal', nameEn: 'Senegal', flag: '🇸🇳' },
  { code: 'RS', nameEs: 'Serbia', nameEn: 'Serbia', flag: '🇷🇸' },
  { code: 'SC', nameEs: 'Seychelles', nameEn: 'Seychelles', flag: '🇸🇨' },
  { code: 'SL', nameEs: 'Sierra Leona', nameEn: 'Sierra Leone', flag: '🇸🇱' },
  { code: 'SG', nameEs: 'Singapur', nameEn: 'Singapore', flag: '🇸🇬' },
  { code: 'SY', nameEs: 'Siria', nameEn: 'Syria', flag: '🇸🇾' },
  { code: 'SO', nameEs: 'Somalia', nameEn: 'Somalia', flag: '🇸🇴' },
  { code: 'LK', nameEs: 'Sri Lanka', nameEn: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'SZ', nameEs: 'Suazilandia', nameEn: 'Eswatini', flag: '🇸🇿' },
  { code: 'ZA', nameEs: 'Sudáfrica', nameEn: 'South Africa', flag: '🇿🇦' },
  { code: 'SD', nameEs: 'Sudán', nameEn: 'Sudan', flag: '🇸🇩' },
  { code: 'SS', nameEs: 'Sudán del Sur', nameEn: 'South Sudan', flag: '🇸🇸' },
  { code: 'SE', nameEs: 'Suecia', nameEn: 'Sweden', flag: '🇸🇪' },
  { code: 'CH', nameEs: 'Suiza', nameEn: 'Switzerland', flag: '🇨🇭' },
  { code: 'SR', nameEs: 'Surinam', nameEn: 'Suriname', flag: '🇸🇷' },
  { code: 'TH', nameEs: 'Tailandia', nameEn: 'Thailand', flag: '🇹🇭' },
  { code: 'TW', nameEs: 'Taiwán', nameEn: 'Taiwan', flag: '🇹🇼' },
  { code: 'TZ', nameEs: 'Tanzania', nameEn: 'Tanzania', flag: '🇹🇿' },
  { code: 'TJ', nameEs: 'Tayikistán', nameEn: 'Tajikistan', flag: '🇹🇯' },
  { code: 'TL', nameEs: 'Timor Oriental', nameEn: 'East Timor', flag: '🇹🇱' },
  { code: 'TG', nameEs: 'Togo', nameEn: 'Togo', flag: '🇹🇬' },
  { code: 'TO', nameEs: 'Tonga', nameEn: 'Tonga', flag: '🇹🇴' },
  { code: 'TT', nameEs: 'Trinidad y Tobago', nameEn: 'Trinidad and Tobago', flag: '🇹🇹' },
  { code: 'TN', nameEs: 'Túnez', nameEn: 'Tunisia', flag: '🇹🇳' },
  { code: 'TM', nameEs: 'Turkmenistán', nameEn: 'Turkmenistan', flag: '🇹🇲' },
  { code: 'TR', nameEs: 'Turquía', nameEn: 'Turkey', flag: '🇹🇷' },
  { code: 'TV', nameEs: 'Tuvalu', nameEn: 'Tuvalu', flag: '🇹🇻' },
  { code: 'UA', nameEs: 'Ucrania', nameEn: 'Ukraine', flag: '🇺🇦' },
  { code: 'UG', nameEs: 'Uganda', nameEn: 'Uganda', flag: '🇺🇬' },
  { code: 'UY', nameEs: 'Uruguay', nameEn: 'Uruguay', flag: '🇺🇾' },
  { code: 'UZ', nameEs: 'Uzbekistán', nameEn: 'Uzbekistan', flag: '🇺🇿' },
  { code: 'VU', nameEs: 'Vanuatu', nameEn: 'Vanuatu', flag: '🇻🇺' },
  { code: 'VE', nameEs: 'Venezuela', nameEn: 'Venezuela', flag: '🇻🇪' },
  { code: 'VN', nameEs: 'Vietnam', nameEn: 'Vietnam', flag: '🇻🇳' },
  { code: 'YE', nameEs: 'Yemen', nameEn: 'Yemen', flag: '🇾🇪' },
  { code: 'DJ', nameEs: 'Yibuti', nameEn: 'Djibouti', flag: '🇩🇯' },
  { code: 'ZM', nameEs: 'Zambia', nameEn: 'Zambia', flag: '🇿🇲' },
  { code: 'ZW', nameEs: 'Zimbabue', nameEn: 'Zimbabwe', flag: '🇿🇼' }
];

const SPECIALTIES = {
  es: [
    'Odontología General',
    'Ortodoncia',
    'Endodoncia',
    'Periodoncia',
    'Cirugía Oral y Maxilofacial',
    'Odontopediatría',
    'Prostodoncia / Prótesis',
    'Implantología',
    'Odontología Estética',
    'Patología Oral',
    'Otro'
  ],
  en: [
    'General Dentistry',
    'Orthodontics',
    'Endodontics',
    'Periodontics',
    'Oral and Maxillofacial Surgery',
    'Pediatric Dentistry',
    'Prosthodontics',
    'Implantology',
    'Esthetic Dentistry',
    'Oral Pathology',
    'Other'
  ]
};

function CountrySelect({ value, onChange, language }: { value: string, onChange: (val: string) => void, language: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCountries = COUNTRIES.filter(c => {
    const name = language === 'en' ? c.nameEn : c.nameEs;
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const selectedCountry = COUNTRIES.find(c => c.nameEs === value || c.nameEn === value);
  const displayValue = selectedCountry ? `${selectedCountry.flag} ${language === 'en' ? selectedCountry.nameEn : selectedCountry.nameEs}` : '';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-3 py-2 border border-slate-300 rounded-lg shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-olive-500 focus:border-olive-500 sm:text-sm flex justify-between items-center"
      >
        <span className={displayValue ? 'text-slate-900' : 'text-slate-500'}>
          {displayValue || (language === 'en' ? 'Select a country...' : 'Selecciona un país...')}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          <div className="sticky top-0 z-10 bg-white px-2 pb-2 pt-1">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-olive-500 focus:border-olive-500"
                placeholder={language === 'en' ? 'Search...' : 'Buscar...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
          </div>
          {filteredCountries.length === 0 ? (
            <div className="px-4 py-2 text-slate-500 text-center">
              {language === 'en' ? 'No countries found' : 'No se encontraron países'}
            </div>
          ) : (
            filteredCountries.map((c) => {
              const name = language === 'en' ? c.nameEn : c.nameEs;
              return (
                <div
                  key={c.code}
                  className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-olive-50 ${value === name ? 'bg-olive-100 text-olive-900' : 'text-slate-900'}`}
                  onClick={() => {
                    onChange(name);
                    setIsOpen(false);
                    setSearch('');
                  }}
                >
                  <span className="block truncate">
                    {c.flag} {name}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function Onboarding() {
  const { user, updateProfile } = useAuth();
  const { language, t } = useLanguage();
  
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [country, setCountry] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [measurementSystem, setMeasurementSystem] = useState<'metric' | 'imperial'>('metric');
  const [legalAccepted, setLegalAccepted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!country || !specialty || !licenseNumber || !legalAccepted) return;
    
    setLoading(true);
    try {
      await updateProfile({
        language,
        country,
        specialty,
        licenseNumber,
        weightUnit: measurementSystem === 'metric' ? 'kg' : 'lbs',
        heightUnit: measurementSystem === 'metric' ? 'cm' : 'ft',
        legalAcceptedAt: serverTimestamp(),
        isProfileComplete: true
      });
      // App.tsx will automatically redirect because isProfileComplete is now true
    } catch (error) {
      console.error('Error saving profile:', error);
      alert(t('error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img src="/logo.png?v=2" alt="Novik Logo" className="w-24 h-24 object-contain" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          {t('completeProfile')}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-100">
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('country')} *
              </label>
              <CountrySelect value={country} onChange={setCountry} language={language} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('specialty')} *
              </label>
              <div className="mt-1">
                <select
                  required
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm bg-white focus:outline-none focus:ring-olive-500 focus:border-olive-500 sm:text-sm"
                >
                  <option value="" disabled>{language === 'en' ? 'Select a specialty...' : 'Selecciona una especialidad...'}</option>
                  {SPECIALTIES[language].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('licenseNumber')} *
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-olive-500 focus:border-olive-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <label className="block text-sm font-medium text-slate-700">
                {t('measurementPreferences')} *
              </label>
              <select
                value={measurementSystem}
                onChange={(e) => setMeasurementSystem(e.target.value as 'metric' | 'imperial')}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-olive-500 focus:border-olive-500 sm:text-sm"
              >
                <option value="metric">{language === 'en' ? 'International Metric (kg, cm)' : 'Métrico Internacional (kg, cm)'}</option>
                <option value="imperial">{language === 'en' ? 'American (lbs, ft)' : 'Americano (lbs, ft)'}</option>
              </select>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-6">
              <div className="flex items-start gap-3">
                <div className="flex items-center h-5 mt-1">
                  <input
                    id="legal"
                    name="legal"
                    type="checkbox"
                    required
                    checked={legalAccepted}
                    onChange={(e) => setLegalAccepted(e.target.checked)}
                    className="focus:ring-olive-500 h-5 w-5 text-olive-600 border-slate-300 rounded"
                  />
                </div>
                <div className="text-sm">
                  <label htmlFor="legal" className="font-medium text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-olive-600" />
                    {language === 'en' ? 'I accept the legal terms' : 'Acepto los términos legales'}
                  </label>
                  <p className="text-slate-500 mt-1 text-xs leading-relaxed">
                    {language === 'en' ? (
                      <>
                        By checking this box, I confirm that I have read and accept the{' '}
                        <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-olive-600 hover:underline">Privacy Policy</Link>,{' '}
                        <Link to="/terms-of-use" target="_blank" rel="noopener noreferrer" className="text-olive-600 hover:underline">Terms of Use</Link>, and{' '}
                        <Link to="/legal-notice" target="_blank" rel="noopener noreferrer" className="text-olive-600 hover:underline">Legal Notice</Link>.
                      </>
                    ) : (
                      <>
                        Al marcar esta casilla, confirmo que he leído y acepto la{' '}
                        <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-olive-600 hover:underline">Política de Privacidad</Link>, los{' '}
                        <Link to="/terms-of-use" target="_blank" rel="noopener noreferrer" className="text-olive-600 hover:underline">Términos de Uso</Link> y el{' '}
                        <Link to="/legal-notice" target="_blank" rel="noopener noreferrer" className="text-olive-600 hover:underline">Aviso Legal</Link>.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || !legalAccepted || !country || !specialty || !licenseNumber}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-olive-600 hover:bg-olive-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-olive-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t('startUsing')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
