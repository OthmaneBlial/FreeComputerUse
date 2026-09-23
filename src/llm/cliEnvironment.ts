export function safeCliEnvironment(){
  const env={...process.env};
  for(const key of Object.keys(env))if(/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(key)||key==='NODE_OPTIONS')delete env[key];
  return env;
}
