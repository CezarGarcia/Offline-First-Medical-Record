package br.univates.medicalfield.clinico.pessoa;

import br.univates.medicalfield.clinico.comum.Autor;
import br.univates.medicalfield.clinico.comum.Banco;
import br.univates.medicalfield.clinico.comum.Origem;
import br.univates.medicalfield.clinico.comum.ResultadoCadastro;
import br.univates.medicalfield.clinico.comum.Uuids;
import br.univates.medicalfield.clinico.comum.Verificacao;
import br.univates.medicalfield.clinico.pessoa.RepositorioPessoas.NovaPessoa;
import br.univates.medicalfield.clinico.pessoa.RepositorioPessoas.ParaMesclar;
import br.univates.medicalfield.clinico.unificacao.Mesclador;
import br.univates.medicalfield.clinico.unificacao.Mesclador.Mesclagem;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes.Apelido;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes.NovoConflito;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cadastro de pessoa com idempotência (o mesmo ID não duplica) e unificação de CPF repetido
 * (docs/07-sincronizacao.md, seções 7.5 e 7.6).
 */
@Service
public class ServicoPessoas {

    private final RepositorioPessoas pessoas;
    private final RepositorioUnificacoes unificacoes;
    private final Mesclador mesclador;

    public ServicoPessoas(RepositorioPessoas pessoas, RepositorioUnificacoes unificacoes, Mesclador mesclador) {
        this.pessoas = pessoas;
        this.unificacoes = unificacoes;
        this.mesclador = mesclador;
    }

    public List<Pessoa> listar() {
        return pessoas.listar();
    }

    @Transactional
    public ResultadoCadastro<Pessoa> cadastrar(PessoaEntrada entrada, Autor autor) {
        Verificacao verificacao = new Verificacao();
        Origem origem = autor.origemPara(entrada.origem(), Instant.now(), verificacao);
        verificacao.lancarSeHouverErros();
        UUID id = entrada.id() != null ? entrada.id() : Uuids.v7();

        // 1) Reenvio de um duplicado que já foi unificado
        Optional<Apelido> apelido = unificacoes.buscarApelido(id, RepositorioUnificacoes.PESSOA);
        if (apelido.isPresent()) {
            return unificado(apelido.get());
        }
        // 2) Reenvio do mesmo ID (idempotência: o primeiro envio vale)
        Optional<Pessoa> existente = pessoas.buscar(id);
        if (existente.isPresent()) {
            return ResultadoCadastro.jaExistia(id, existente.get());
        }

        // 3) Pessoa nova
        NovaPessoa nova = new NovaPessoa(id, valores(entrada), entrada.cpf(), origem, autor.profissional().id());
        if (pessoas.inserir(nova) == 1) {
            return ResultadoCadastro.criado(id, pessoas.buscar(id).orElseThrow());
        }

        // Não entrou: o mesmo ID chegou ao mesmo tempo, ou o CPF já é de outra pessoa
        Optional<Pessoa> chegouJunto = pessoas.buscar(id);
        if (chegouJunto.isPresent()) {
            return ResultadoCadastro.jaExistia(id, chegouJunto.get());
        }
        ParaMesclar alvo = pessoas.travarPorCpf(entrada.cpf())
                .orElseThrow(() -> new IllegalStateException("Cadastro de pessoa recusado sem motivo aparente"));
        Optional<Apelido> unificadoEnquantoEsperava = unificacoes.buscarApelido(id, RepositorioUnificacoes.PESSOA);
        if (unificadoEnquantoEsperava.isPresent()) {
            return unificado(unificadoEnquantoEsperava.get());
        }
        return unificar(alvo, nova, entrada, origem, autor);
    }

    /** CPF repetido: a pessoa que já estava no servidor fica e absorve o que chegou. */
    private ResultadoCadastro<Pessoa> unificar(ParaMesclar alvo, NovaPessoa nova, PessoaEntrada entrada, Origem origem,
                                               Autor autor) {
        Mesclagem mesclagem = mesclador.mesclar(RepositorioPessoas.CAMPOS_MESCLAVEIS, alvo.valores(), alvo.carimbos(),
                alvo.criadoEm(), nova.valores(), origem.criadoEm());
        pessoas.aplicarMesclagem(alvo.id(), mesclagem.valores(), mesclagem.carimbos());

        Map<String, Object> recebido = new LinkedHashMap<>();
        recebido.put("id", nova.id());
        recebido.put("dados", entrada);
        recebido.put("origem", origem);
        UUID conflitoId = unificacoes.registrarConflito(new NovoConflito(
                RepositorioUnificacoes.PESSOA, "CPF_DUPLICADO", alvo.id(), nova.id(), mesclador.estrategia().nome(),
                mesclagem.diferencas(), recebido, autor.profissional().id(), origem.dispositivoId(),
                origem.dispositivoNome()));
        unificacoes.registrarApelido(nova.id(), alvo.id(), RepositorioUnificacoes.PESSOA, conflitoId);
        return ResultadoCadastro.unificado(alvo.id(), nova.id(), conflitoId, pessoas.buscar(alvo.id()).orElseThrow());
    }

    private ResultadoCadastro<Pessoa> unificado(Apelido apelido) {
        return ResultadoCadastro.unificado(apelido.idMantido(), apelido.idDescartado(), apelido.conflitoId(),
                pessoas.buscar(apelido.idMantido()).orElseThrow());
    }

    /** Valores da entrada por coluna, já limpos (texto vazio vira null). */
    private static Map<String, String> valores(PessoaEntrada e) {
        PessoaEntrada.Contato contato = e.contato() != null ? e.contato() : new PessoaEntrada.Contato(null, null, null, null);
        Map<String, String> valores = new LinkedHashMap<>();
        valores.put("nome", Banco.limpar(e.nome()));
        valores.put("data_nascimento", e.dataNascimento() == null ? null : e.dataNascimento().toString());
        valores.put("sexo", e.sexo());
        valores.put("telefone", Banco.limpar(e.telefone()));
        valores.put("email", Banco.limpar(e.email()));
        valores.put("contato_nome", Banco.limpar(contato.nome()));
        valores.put("contato_parentesco", Banco.limpar(contato.parentesco()));
        valores.put("contato_telefone", Banco.limpar(contato.telefone()));
        valores.put("contato_email", Banco.limpar(contato.email()));
        return valores;
    }
}
