import { Text as DefaultText, View as DefaultView } from 'react-native';

export function Text(props: DefaultText['props']) {
  return <DefaultText {...props} />;
}

export function View(props: DefaultView['props']) {
  return <DefaultView {...props} />;
}
