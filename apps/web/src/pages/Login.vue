<template>
  <q-page padding>
    <div class="row q-pa-md flex flex-center">
      <div class="col col-md-4">
        <q-form @submit="login()">
          <q-card square flat bordered class="q-pa-md q-mt-lg shadow-1">
            <q-card-section>
              <div class="text-h5 row">
                Login <q-space />
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
                autocomplete="current-password"
              />
            </q-card-section>
            <q-card-section v-if="error">
              <p class="text-red">{{ error }}</p>
            </q-card-section>
            <q-card-actions class="q-px-md">
              <q-btn flat label="create" type="submit" :disable="!username || !password" />
              <q-space />
              <q-btn
                flat
                color="primary"
                label="Login"
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
import { defineComponent, ref, watchEffect } from 'vue';
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
    const store = useStore();
    const router = useRouter();
    const $q = useQuasar();

    watchEffect(() => {
      if (store.isLoggedIn) {
        router.push({ name: 'Home' });
      }
    });

    return {
      username,
      password,
      error,
      showApi,
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
                      error.value = err.data;
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
                      error.value = err.data;
                    });
                }
              }
            },
            (err: any) => {
              if (err.status === 401) {
                error.value = 'Wrong user or password';
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
