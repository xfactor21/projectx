#include <emscripten/emscripten.h>
#include <projectM-4/projectM.h>

static projectm_handle g_instance = nullptr;

extern "C" {
EMSCRIPTEN_KEEPALIVE int pm_create(int width, int height) {
    if (g_instance) {
        projectm_destroy(g_instance);
        g_instance = nullptr;
    }
    g_instance = projectm_create();
    if (!g_instance) return 0;
    projectm_set_window_size(g_instance, width > 0 ? width : 512, height > 0 ? height : 512);
    projectm_set_fps(g_instance, 60);
    projectm_set_mesh_size(g_instance, 48, 36);
    projectm_set_aspect_correction(g_instance, true);
    projectm_set_preset_duration(g_instance, 3600.0);
    projectm_set_soft_cut_duration(g_instance, 2.0);
    projectm_set_beat_sensitivity(g_instance, 1.0f);
    return 1;
}

EMSCRIPTEN_KEEPALIVE void pm_destroy() {
    if (g_instance) {
        projectm_destroy(g_instance);
        g_instance = nullptr;
    }
}

EMSCRIPTEN_KEEPALIVE void pm_resize(int width, int height) {
    if (!g_instance) return;
    projectm_set_window_size(g_instance, width > 0 ? width : 512, height > 0 ? height : 512);
}

EMSCRIPTEN_KEEPALIVE void pm_load_preset(const char* data, int smooth) {
    if (!g_instance || !data) return;
    projectm_load_preset_data(g_instance, data, smooth != 0);
}

EMSCRIPTEN_KEEPALIVE void pm_feed_audio(const float* samples, int frames, int channels) {
    if (!g_instance || !samples || frames <= 0) return;
    projectm_pcm_add_float(g_instance, samples, static_cast<unsigned int>(frames), channels == 1 ? PROJECTM_MONO : PROJECTM_STEREO);
}

EMSCRIPTEN_KEEPALIVE void pm_render() {
    if (!g_instance) return;
    projectm_opengl_render_frame(g_instance);
}

EMSCRIPTEN_KEEPALIVE int pm_max_samples() {
    return static_cast<int>(projectm_pcm_get_max_samples());
}
}
