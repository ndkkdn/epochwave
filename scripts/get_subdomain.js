const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = '8b006373d2632e537012d5ffdae0fa56';

fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
})
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(err => console.error('ERROR', err));
