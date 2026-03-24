import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import { Users, Activity, Globe, FileText, Loader2 } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format, subDays, isAfter, startOfDay, endOfDay } from 'date-fns';
import { es, enUS } from 'date-fns/locale';

interface UserData {
  id: string;
  createdAt: any;
  country?: string;
  role: string;
}

interface CaseData {
  id: string;
  createdAt: any;
}

const COLORS = ['#4d7c0f', '#047857', '#0369a1', '#6d28d9', '#be123c', '#b45309', '#1d4ed8', '#0f766e'];

export default function AdminUsers() {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  const [stats, setStats] = useState({
    totalUsers: 0,
    newUsersPeriod: 0,
    totalCases: 0,
  });

  const [activityData, setActivityData] = useState<any[]>([]);
  const [countryData, setCountryData] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const usersSnapshot = await getDocs(query(collection(db, 'users')));
      const casesSnapshot = await getDocs(query(collection(db, 'cases')));
      const loginsSnapshot = await getDocs(query(collection(db, 'logins')));

      const users: UserData[] = [];
      usersSnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() } as UserData);
      });

      const cases: CaseData[] = [];
      casesSnapshot.forEach((doc) => {
        cases.push({ id: doc.id, ...doc.data() } as CaseData);
      });

      const logins: any[] = [];
      loginsSnapshot.forEach((doc) => {
        logins.push({ id: doc.id, ...doc.data() });
      });

      const periodStart = startOfDay(new Date(startDate));
      const periodEnd = endOfDay(new Date(endDate));

      // Basic Stats
      const totalUsers = users.length;
      const newUsersPeriod = users.filter(u => u.createdAt?.toDate && isAfter(u.createdAt.toDate(), periodStart) && !isAfter(u.createdAt.toDate(), periodEnd)).length;
      const totalCases = cases.filter(c => c.createdAt?.toDate && isAfter(c.createdAt.toDate(), periodStart) && !isAfter(c.createdAt.toDate(), periodEnd)).length;

      setStats({ totalUsers, newUsersPeriod, totalCases });

      // Country Data (filtered by period)
      const countryCounts: Record<string, number> = {};
      const normalizeCountry = (country: string) => {
        const normalized = country.trim();
        if (normalized.toLowerCase() === 'spain' || normalized.toLowerCase() === 'españa') return 'España';
        return normalized;
      };

      users.filter(u => u.createdAt?.toDate && isAfter(u.createdAt.toDate(), periodStart) && !isAfter(u.createdAt.toDate(), periodEnd)).forEach(u => {
        if (u.country) {
          const country = normalizeCountry(u.country);
          countryCounts[country] = (countryCounts[country] || 0) + 1;
        }
      });
      
      const formattedCountryData = Object.entries(countryCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
      
      setCountryData(formattedCountryData);

      // Activity Data
      const activityMap: Record<string, { date: string; users: number; cases: number; logins: number }> = {};
      
      // Initialize period days
      const daysDiff = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)));
      for (let i = 0; i < daysDiff; i++) {
        const d = subDays(periodEnd, daysDiff - 1 - i);
        const dateStr = format(d, 'yyyy-MM-dd');
        const displayDate = format(d, 'MMM dd', { locale: language === 'es' ? es : enUS });
        activityMap[dateStr] = { date: displayDate, users: 0, cases: 0, logins: 0 };
      }

      users.forEach(u => {
        if (u.createdAt?.toDate) {
          const dateStr = format(u.createdAt.toDate(), 'yyyy-MM-dd');
          if (activityMap[dateStr]) {
            activityMap[dateStr].users += 1;
          }
        }
      });

      cases.forEach(c => {
        if (c.createdAt?.toDate) {
          const dateStr = format(c.createdAt.toDate(), 'yyyy-MM-dd');
          if (activityMap[dateStr]) {
            activityMap[dateStr].cases += 1;
          }
        }
      });

      logins.forEach(l => {
        if (l.timestamp?.toDate) {
          const dateStr = format(l.timestamp.toDate(), 'yyyy-MM-dd');
          if (activityMap[dateStr]) {
            activityMap[dateStr].logins += 1;
          }
        }
      });

      setActivityData(Object.values(activityMap));

    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-olive-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <Users className="w-7 h-7 text-olive-600" />
              {t('usersOverview')}
            </h1>
            <p className="text-slate-500 mt-1">{t('usersOverviewDesc')}</p>
          </div>
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
            <span className="text-sm text-slate-500 font-medium px-2">{t('dateRange')}:</span>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-md focus:ring-olive-500 focus:border-olive-500 block p-2"
            />
            <span className="text-slate-400">-</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-md focus:ring-olive-500 focus:border-olive-500 block p-2"
            />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{t('totalUsers')}</p>
              <p className="text-2xl font-bold text-slate-900">{stats.totalUsers}</p>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
              <Activity className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{t('newUsersPeriod')}</p>
              <p className="text-2xl font-bold text-slate-900">{stats.newUsersPeriod}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{t('consultationsPeriod')}</p>
              <p className="text-2xl font-bold text-slate-900">{stats.totalCases}</p>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Activity Chart */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">{t('activityChart')}</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activityData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line type="monotone" name={t('newRegistrations')} dataKey="users" stroke="#0ea5e9" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                  <Line type="monotone" name={t('consultations')} dataKey="cases" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                  <Line type="monotone" name={t('logins')} dataKey="logins" stroke="#f59e0b" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Country Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
            <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
              <Globe className="w-5 h-5 text-slate-400" />
              {t('usersByCountry')}
            </h2>
            <div className="flex-1 min-h-[300px]">
              {countryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={countryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {countryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend layout="vertical" verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '20px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Country Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-medium text-slate-900">{t('usersByCountry')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">{t('country')}</th>
                  <th className="px-6 py-3 text-right">{t('usersCount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {countryData.map((country, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">{country.name}</td>
                    <td className="px-6 py-4 text-right">{country.value}</td>
                  </tr>
                ))}
                {countryData.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-6 py-8 text-center text-slate-400">
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
