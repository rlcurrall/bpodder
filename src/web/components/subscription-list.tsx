import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Text, TextLink } from "./text";

interface SubscriptionListProps {
  subscriptions: string[];
}

export function SubscriptionList({ subscriptions }: SubscriptionListProps) {
  if (subscriptions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <Text>No podcast subscriptions yet.</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscriptions ({subscriptions.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="space-y-2">
          {subscriptions.map((url) => (
            <li
              key={url}
              class="border-b border-zinc-200 dark:border-zinc-700 last:border-b-0 pb-2 last:pb-0"
            >
              <TextLink href={url} target="_blank" rel="noopener noreferrer" class="truncate block">
                {url}
              </TextLink>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
