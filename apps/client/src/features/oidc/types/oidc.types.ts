export interface IOidcProvider {
  id: string;
  name: string;
  type: "oidc";
  oidcIssuer: string;
  oidcClientId: string;
  hasClientSecret: boolean;
  allowSignup: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IOidcProviderList {
  callbackUrlTemplate: string;
  items: IOidcProvider[];
}

export interface ICreateOidcProvider {
  name: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret?: string;
  allowSignup?: boolean;
  isEnabled?: boolean;
}

export interface IUpdateOidcProvider extends Partial<ICreateOidcProvider> {
  providerId: string;
}

/** Subset of an auth provider exposed on the public workspace endpoint. */
export interface IPublicAuthProvider {
  id: string;
  name: string;
  type: string;
}
