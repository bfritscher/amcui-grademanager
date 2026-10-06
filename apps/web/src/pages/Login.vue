<template>
  <q-page padding>
    <div class="row q-pa-md flex flex-center">
      <div class="col col-md-4">
        <q-form @submit="registerMode ? register() : login()">
          <q-card square flat bordered class="q-pa-md q-mt-lg shadow-1">
            <q-card-section>
              <div class="text-h5 row">
                {{ registerMode ? 'Request an account' : 'Login' }} <q-space />
                <q-btn
                  icon="sym_o_settings"
                  padding="xs"
                  size="sm"
                  flat
                  class="text-grey-5"
                  @click="showApi = !showApi"
                />
              </div>
              <q-input v-if="showApi" v-model="API.URL" label="API URL" />
              <q-input
                v-model="username"
                class="q-my-md"
                type="text"
                label="Username"
                autocomplete="username"
              />
              <q-input
                v-model="password"
                type="password"
                label="Password"
                :autocomplete="registerMode ? 'new-password' : 'current-password'"
              />
              <template v-if="registerMode">
                <q-input v-model="displayName" label="Your name" class="q-my-md" required />
                <q-input v-model="email" type="email" label="Email address" required />
                <p class="text-caption q-mt-md">
                  Use at least 12 characters for your password. Verify your email, then wait for
                  administrator approval.
                </p>
              </template>
            </q-card-section>
            <q-card-section v-if="error">
              <p class="text-red">{{ error }}</p>
            </q-card-section>
            <q-card-section v-if="message"
              ><p>{{ message }}</p></q-card-section
            >
            <q-card-actions class="q-px-md">
              <q-btn
                flat
                :label="registerMode ? 'Back to login' : 'Request an account'"
                :disable="!registerMode && !registrationAvailable"
                @click="
                  registerMode = !registerMode;
                  error = '';
                  message = '';
                "
              />
              <q-btn
                v-if="!registerMode && needsVerification"
                flat
                label="Resend verification"
                @click="resend"
              />
              <q-space />
              <q-btn
                flat
                color="primary"
                :label="registerMode ? 'Submit request' : 'Login'"
                type="submit"
                :disable="!username || !password"
              />
            </q-card-actions>
          </q-card>
        </q-form>
      </div>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import * as base64buffer from 'base64-arraybuffer';
import { useApiStore } from '@/stores/api';
import { useStore } from '@/stores/store';

export default defineComponent({
  name: 'Login',
  setup() {
    const API = useApiStore();
    const username = ref('');
    const password = ref('');
    const showApi = ref(false);
    const error = ref('');
    const message = ref('');
    const registerMode = ref(false);
    const email = ref('');
    const displayName = ref('');
    const registrationAvailable = ref(false);
    const needsVerification = ref(false);
    const store = useStore();
    const router = useRouter();
    const $q = useQuasar();
    onMounted(async () => {
      try {
        registrationAvailable.value = (
          await API.$http.get(`${API.URL}/registration/status`)
        ).data.available;
      } catch {
        /* Login remains available. */
      }
      const token = router.currentRoute.value.query.verify;
      if (typeof token === 'string') {
        try {
          message.value = (
            await API.$http.post(`${API.URL}/register/verify`, { token })
          ).data.message;
        } catch (e: any) {
          error.value =
            e.response?.data?.error || e.response?.data || 'Invalid or expired verification link';
        }
        await router.replace({ name: 'Login' });
      }
    });

    watchEffect(() => {
      if (store.isLoggedIn) {
        const redirect = String(router.currentRoute.value.query.redirect || '');
        router.push(redirect.startsWith('/mcp/authorize?') ? redirect : { name: 'Home' });
      }
    });

    return {
      username,
      password,
      error,
      showApi,
      message,
      registerMode,
      email,
      displayName,
      registrationAvailable,
      needsVerification,
      async register() {
        error.value = '';
        message.value = '';
        try {
          const response = await API.$http.post(`${API.URL}/register`, {
            username: username.value,
            password: password.value,
            email: email.value,
            displayName: displayName.value
          });
          message.value = response.data.message;
          registerMode.value = false;
        } catch (e: any) {
          error.value = e.response?.data?.error || e.response?.data || 'Unable to submit request';
        }
      },
      async resend() {
        try {
          message.value = (
            await API.$http.post(`${API.URL}/register/resend`, {
              username: username.value,
              password: password.value
            })
          ).data.message;
        } catch (e: any) {
          error.value =
            e.response?.data?.error || e.response?.data || 'Unable to resend verification';
        }
      },
      API,
      login() {
        API.$http
          .post(API.URL + '/login', {
            username: username.value,
            password: password.value
          })
          .then(
            async (r: any) => {
              // TODO-nice select if multiple methods activated
              if (r.data.authenticator && r.data.authenticator.length > 0) {
                $q.dialog({
                  title: 'Authenticator Token',
                  prompt: {
                    model: '',
                    type: 'text'
                  },
                  cancel: true,
                  persistent: true
                }).onOk((token: string) => {
                  API.$http
                    .post(API.URL + '/login', {
                      username: username.value,
                      password: password.value,
                      authenticator: {
                        type: 'authenticator',
                        token
                      }
                    })
                    .catch((err: any) => {
                      error.value = err.response?.data;
                    });
                });
              }
              if (r.data.fido2 && r.data.fido2.challenge) {
                const loginOptions = r.data.fido2;
                loginOptions.challenge = base64buffer.decode(loginOptions.challenge as string);
                loginOptions.allowCredentials = loginOptions.allowCredentials.map(
                  (item: { id: any }) => {
                    item.id = base64buffer.decode(item.id as string);
                    return item;
                  }
                );
                const credential: any = await navigator.credentials.get({
                  publicKey: loginOptions
                });
                if (credential) {
                  const passableCredential = {
                    id: credential.id,
                    rawId: base64buffer.encode(credential.rawId as ArrayBuffer),
                    response: {
                      clientDataJSON: base64buffer.encode(
                        credential.response.clientDataJSON as ArrayBuffer
                      ),
                      authenticatorData: base64buffer.encode(
                        credential.response.authenticatorData as ArrayBuffer
                      ),
                      signature: base64buffer.encode(credential.response.signature as ArrayBuffer),
                      userHandle: base64buffer.encode(credential.response.userHandle as ArrayBuffer)
                    },
                    type: credential.type
                  };
                  return API.$http
                    .post(`${API.URL}/login`, {
                      username: username.value,
                      password: password.value,
                      authenticator: {
                        type: 'fido2',
                        response: passableCredential
                      }
                    })
                    .catch((err: any) => {
                      error.value = err.response?.data;
                    });
                }
              }
            },
            (err: any) => {
              if (err.status === 401) {
                error.value = 'Wrong user or password';
              } else if (err.status === 403 && err.response?.data?.status) {
                needsVerification.value = err.response?.data.status === 'unverified';
                error.value =
                  err.response?.data.status === 'pending'
                    ? 'Your account is awaiting administrator approval.'
                    : err.response?.data.status === 'unverified'
                      ? 'Please verify your email address.'
                      : 'Your account is unavailable. Contact an administrator.';
              } else {
                error.value = err.msg || 'Unable to connect to server';
              }
            }
          );
      }
    };
  }
});
</script>
