type Station = {
  id: string;
  name: string;
  countryCode?: string;
  country?: string;
  genres: string[];
  coordinates?: [longitude: number, latitude: number];
  streams: Array<{
    url: string;
    codec?: string;
    bitrate?: number;
  }>;
  homepage?: string;
};

export default Station;
