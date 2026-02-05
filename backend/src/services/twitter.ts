const BASE_URL = 'https://api.twitterapi.io/twitter';
const API_KEY = process.env.TWITTERAPI_KEY!;

async function twitterFetch(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-API-Key': API_KEY },
  });
  if (!res.ok) throw new Error(`Twitter API error: ${res.status}`);
  return res.json();
}

export async function getTweet(tweetId: string) {
  return twitterFetch(`/tweets?tweet_ids=${tweetId}`);
}

export async function searchTweets(query: string) {
  return twitterFetch(`/tweet/advanced_search?query=${encodeURIComponent(query)}&queryType=Latest`);
}

export async function getUserByUsername(username: string) {
  return twitterFetch(`/user/info?userName=${encodeURIComponent(username)}`);
}
