export const TTS_STREAM_PROTO = `
syntax = "proto3";
package google.cloud.texttospeech.v1beta1;

service TextToSpeech {
  rpc StreamingSynthesize (stream StreamingSynthesizeRequest) returns (stream StreamingSynthesizeResponse);
}

message StreamingSynthesizeRequest {
  oneof streaming_request {
    StreamingSynthesizeConfig streaming_config = 1;
    StreamingSynthesisInput input = 2;
  }
}

message StreamingSynthesizeResponse {
  bytes audio_content = 1;
}

message StreamingSynthesizeConfig {
  VoiceSelectionParams voice = 1;
  StreamingAudioConfig streaming_audio_config = 4;
  AdvancedVoiceOptions advanced_voice_options = 7;
}

message VoiceSelectionParams {
  string language_code = 1;
  string name = 2;
  string model_name = 6;
}

message StreamingAudioConfig {
  int32 audio_encoding = 1;
  int32 sample_rate_hertz = 2;
}

message StreamingSynthesisInput {
  string text = 1;
  string prompt = 6;
}

message AdvancedVoiceOptions {
  message SafetySetting {
    int32 category = 1;
    int32 threshold = 2;
  }
  message SafetySettings {
    repeated SafetySetting settings = 1;
  }
  SafetySettings safety_settings = 9;
}
`;
