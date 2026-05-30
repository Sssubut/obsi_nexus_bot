export interface PluginSettings {
  botToken: string;
  defaultFolderPath: string;
  mediaPath: string;
}

export interface MockMessage {
  id: number;
  from: {
    username: string;
    first_name: string;
  };
  text: string;
  date: number; // Unix timestamp
  photoName?: string;
  photoUrl?: string;
}
