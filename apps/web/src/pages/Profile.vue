<template>
  <q-page class="container">
    <q-btn flat color="primary" class="q-mt-md" @click="router.back()">Back</q-btn>
    <q-form class="row q-py-lg" @submit="changePassword()">
      <q-card flat bordered class="col-12 col-md-8 offset-md-2">
        <q-card-section>
          <div class="text-h5">Password Manager</div>
          <div class="row">
            <q-input
              v-model="profile.oldPassword"
              type="password"
              label="Old Password"
              required
              class="col"
              autocomplete="current-password"
              :rules="[(value) => !!value || 'Password is required']"
            />
            <q-input
              v-model="profile.password"
              type="password"
              label="New Password"
              required
              class="col q-mx-lg"
              autocomplete="new-password"
              :rules="[(value) => !!value || 'Password is required']"
            />
            <q-input
              v-model="profile.password2"
              type="password"
              label="New Password (repeat)"
              required
              class="col"
              autocomplete="new-password"
              :rules="[(value) => value === profile.password || 'Does not match password']"
            />
          </div>
        </q-card-section>
        <q-card-section v-if="profile.error">
          <p class="text-red">{{ profile.error }}</p>
        </q-card-section>
        <q-separator></q-separator>
        <q-card-actions align="right">
          <q-btn
            color="primary"
            type="submit"
            flat
            :disable="profile.password !== profile.password2"
            >Change Password</q-btn
          >
        </q-card-actions>
      </q-card>
    </q-form>
    <div class="row q-py-lg">
      <q-card flat bordered class="col-12 col-md-8 offset-md-2">
        <q-card-section>
          <div class="text-h5">2-Factor Authentication</div>
          <q-input
            v-model="profile.mfaPassword"
            type="password"
            label="Current Password"
            autocomplete="current-password"
            required
          />
        </q-card-section>
        <q-card-section v-if="profile.mfaError">
          <p class="text-red">{{ profile.mfaError }}</p>
        </q-card-section>
        <q-card-section v-if="profile.authentifierQRCode" class="text-center">
          <h2 class="text-h5 text-negative">
            Important scan this code now, it will not be shown again!
          </h2>
          <q-img :src="profile.authentifierQRCode" style="max-width: 300px" />
        </q-card-section>
        <q-card-section v-if="store.user && store.user.authenticators">
          <q-list>
            <q-item v-for="(a, index) in store.user.authenticators" :key="index">
              <q-item-section>
                <q-item-label>{{ a.label }} [{{ a.type }}]</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn
                  icon="sym_o_delete"
                  color="negative"
                  flat
                  :disable="profile.mfaPassword.length === 0"
                  @click="removeAuthenticator(a)"
                />
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            color="primary"
            flat
            :disable="profile.mfaPassword.length === 0"
            @click="addAuthenticator()"
            >Add Authenticator Device</q-btn
          >
          <q-btn
            color="primary"
            flat
            :disable="profile.mfaPassword.length === 0"
            @click="addFido2()"
            >Add webauthn/FIDO2 Device</q-btn
          >
        </q-card-actions>
      </q-card>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import * as base64buffer from 'base64-arraybuffer';
import { useApiStore } from '@/stores/api';
import { useStore } from '@/stores/store';

export default defineComponent({
  name: 'Profile',
  setup() {
    const API = useApiStore();
    const store = useStore();
    const router = useRouter();
    const profile = reactive({
      error: '',
      oldPassword: '',
      password: '',
      password2: '',
      mfaPassword: '',
      mfaError: '',
      authentifierQRCode: ''
    });
    onMounted(() => {
      API.project = '';
    });
    return {
      store,
      profile,
      router,
      changePassword() {
        profile.error = '';
        API.changePassword(profile.oldPassword, profile.password).then(
          () => {
            profile.oldPassword = '';
            profile.password = '';
            profile.password2 = '';
          },
          (response: any) => {
            profile.error = response.data;
          }
        );
      },
      addAuthenticator() {
        API.$http
          .post(`${API.URL}/profile/addAuthenticator`, {
            password: profile.mfaPassword,
            label: prompt('Label for this token')
          })
          .then((result: any) => {
            profile.authentifierQRCode = result.data.qrCodeDataUrl;
          })
          .catch((result: any) => {
            profile.mfaError = result.data;
          });
      },
      removeAuthenticator(a: { label: string; type: string }) {
        API.$http
          .post(`${API.URL}/profile/removeMFA`, {
            password: profile.mfaPassword,
            type: a.type,
            label: a.label
          })
          .then(() => {
            store.logout();
          })
          .catch((result: any) => {
            profile.mfaError = result.data;
          });
      },
      addFido2() {
        API.$http
          .get(`${API.URL}/profile/addFido2`)
          .then(async (result: any) => {
            const registrationOptions = result.data;
            registrationOptions.challenge = base64buffer.decode(
              registrationOptions.challenge as string
            );
            registrationOptions.user.id = base64buffer.decode(
              registrationOptions.user.id as string
            );
            const credential: any = await navigator.credentials.create({
              publicKey: registrationOptions
            });
            if (credential) {
              const passableCredential = {
                id: credential.id,
                rawId: base64buffer.encode(credential.rawId as ArrayBuffer),
                response: {
                  clientDataJSON: base64buffer.encode(
                    credential.response.clientDataJSON as ArrayBuffer
                  ),
                  attestationObject: base64buffer.encode(
                    credential.response.attestationObject as ArrayBuffer
                  )
                },
                type: credential.type
              };
              return API.$http
                .post(`${API.URL}/profile/addFido2`, {
                  password: profile.mfaPassword,
                  label: prompt('Label for this token'),
                  response: passableCredential
                })
                .then(() => {
                  store.logout();
                });
            }
          })
          .catch((result: any) => {
            profile.mfaError = result.data || result;
          });
      }
    };
  }
});
</script>
