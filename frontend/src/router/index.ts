import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import AuthCallback from '../views/AuthCallback.vue'
import { supabase } from '../supabase'; // Import the Supabase client

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { requiresAuth: true } // Protect this route
    },
    {
      path: '/:uniqueId',
      name: 'monitor',
      component: () => import('../views/MonitorView.vue'),
      meta: { requiresAuth: true } // Protect this route
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: AuthCallback
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const { data: { session } } = await supabase.auth.getSession();
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);

  if (requiresAuth && !session) {
    next('/login');
  } else if ((to.path === '/login' || to.path === '/auth/callback') && session) {
    // If user is logged in and tries to access login or callback page, redirect to home
    next('/');
  } else {
    next();
  }
});

export default router
